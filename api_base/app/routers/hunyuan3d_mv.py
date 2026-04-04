"""
Hunyuan3D-2mv Router - 2 endpoint tách biệt:
  POST /generate-shape-mv   → Stage 1: sinh white mesh
  POST /generate-texture-mv → Stage 2: sơn texture lên white mesh
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict
from sqlalchemy.orm import Session
from pathlib import Path
import base64
from io import BytesIO
from PIL import Image
import asyncio
import json

from app.config import settings
from app.models.base_db import get_db
from app.security.security import get_current_user
from app.models.user import User
from app.services.hunyuan3d_mv_service import hunyuan3d_mv_service

router = APIRouter()


# ────────────────────────────────────────────────────────────────────────────
# Dependency
# ─────────────────────────────────────────────���──────────────────────────────

async def get_uid(current_user: User = Depends(get_current_user)) -> int:
    return current_user.id


# ────────────────────────────────────────────────────────────────────────────
# Request / Response models
# ────────────────────────────────────────────────────────────────────────────

class ShapeRequest(BaseModel):
    """Stage 1 — sinh white mesh từ ảnh multiview."""
    images_base64: Dict[str, str] = Field(
        ...,
        description='Ảnh base64 theo góc. "front" bắt buộc, "left"/"back"/"right" tùy chọn.'
    )
    input_image_url: str = Field(..., description="URL ảnh front (đã upload, lưu DB)")
    remove_background: bool = Field(True)
    num_inference_steps: int = Field(50, ge=20, le=100, description="Số bước diffusion")
    octree_resolution:   int = Field(380, ge=200, le=512, description="Độ phân giải mesh")
    polycount: Optional[int] = Field(
        None,
        description="Số faces mục tiêu (decimate). None hoặc <=0 thì bỏ qua decimation.",
        ge=1000,
    )
    guidance_scale: float = Field(
        5.0,
        description="Guidance scale cho diffusion (tuning chất lượng/chi tiết).",
        ge=0.1,
        le=20.0,
    )

    class Config:
        json_schema_extra = {
            "example": {
                "images_base64": {
                    "front": "iVBORw0KGgoAAAA...",
                    "left":  "iVBORw0KGgoAAAA...",
                    "back":  "iVBORw0KGgoAAAA...",
                    "right": "iVBORw0KGgoAAAA..."
                },
                "input_image_url": "https://example.com/uploads/front.png",
                "remove_background": True,
                "num_inference_steps": 50,
                "octree_resolution": 380,
                "polycount": 30000,
                "guidance_scale": 5.0,
            }
        }


class TextureRequest(BaseModel):
    """Stage 2 — sơn texture lên white mesh đã có."""
    shape_job_id: str = Field(
        ...,
        description="job_id trả về từ Stage 1 (phải có status=completed)"
    )
    front_image_base64: str = Field(
        ...,
        description="Ảnh front base64 dùng để sơn texture"
    )
    texture_4k: bool = Field(
        False,
        description="Nếu True thì upscale texture lên 4K bằng RealESRGAN (nếu có weights)."
    )

    class Config:
        json_schema_extra = {
            "example": {
                "shape_job_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                "front_image_base64": "iVBORw0KGgoAAAA...",
                "texture_4k": False
            }
        }


class StageResponse(BaseModel):
    job_id: str
    status: str
    stage: str
    message: str
    shape_job_id: Optional[str] = None   # chỉ có ở Stage 2 response


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    stage: Optional[str] = None
    input_image_url: Optional[str] = None
    output_model_url: Optional[str] = None
    has_texture: bool = False
    has_skeleton: bool = False
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class WorkerStatusResponse(BaseModel):
    shape_pipeline_loaded:   bool
    texture_pipeline_loaded: bool
    device:      str
    active_jobs: int
    mv_available: bool
    model_path:  str


# ────────────────────────────────────────────────────────────────────────────
# STAGE 1 endpoint
# ────────────────────────────────────────────────────────────────────────────

@router.post("/generate-shape-mv", response_model=StageResponse)
async def generate_shape_mv(
    request: ShapeRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_uid),
):
    """
    ## Stage 1 — Sinh white mesh từ ảnh multiview

    Gửi 1-4 ảnh:
    - "front" bắt buộc
    - "left" / "back" / "right" tùy chọn

    Khi `status = completed`:
    - Download white mesh: `GET /api/v1/download/{job_id}/white`
    - Xem thấy hình dạng OK → chạy tiếp Stage 2

    **Thời gian:** ~2-5 phút tùy server/GPU.
    """
    if "front" not in request.images_base64:
        raise HTTPException(status_code=400, detail="Thiếu ảnh 'front' trong images_base64")

    for view, b64 in request.images_base64.items():
        try:
            Image.open(BytesIO(base64.b64decode(b64)))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Ảnh '{view}' không hợp lệ: {e}")

    try:
        result = await hunyuan3d_mv_service.generate_shape(
            db=db,
            images_base64=request.images_base64,
            input_image_url=request.input_image_url,
            remove_background=request.remove_background,
            num_inference_steps=request.num_inference_steps,
            octree_resolution=request.octree_resolution,
            polycount=request.polycount,
            guidance_scale=request.guidance_scale,
            user_id=user_id,
        )
        return StageResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-shape-mv/upload", response_model=StageResponse)
async def generate_shape_mv_upload(
    front: UploadFile = File(..., description="Ảnh góc trước (bắt buộc)"),
    left:  Optional[UploadFile] = File(None, description="Ảnh góc trái"),
    back:  Optional[UploadFile] = File(None, description="Ảnh góc sau"),
    right: Optional[UploadFile] = File(None, description="Ảnh góc phải"),
    model_name: Optional[str] = Form(None, description="Tên model (mặc định: tên file front)"),
    remove_background: bool = Form(True),
    num_inference_steps: int = Form(50),
    octree_resolution:   int = Form(380),
    polycount: Optional[int] = Form(None),
    guidance_scale: float = Form(5.0),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_uid),
):
    """
    ## Stage 1 — Upload file trực tiếp (thay vì gửi base64)

    Các góc hỗ trợ: front (bắt buộc), left/back/right (tùy chọn).

    ```bash
    curl -X POST ".../api/v1/generate-shape-mv/upload" \\
         -H "Authorization: Bearer TOKEN" \\
         -F "front=@front.png" \\
         -F "left=@left.png"  \\
         -F "back=@back.png"  \\
         -F "right=@right.png" \\
         -F "polycount=30000" \\
         -F "guidance_scale=5.0"
    ```
    """
    images_base64: Dict[str, str] = {}
    for view, upload in {"front": front, "left": left, "back": back, "right": right}.items():
        if upload is None:
            continue
        try:
            contents = await upload.read()
            Image.open(BytesIO(contents))  # validate
            images_base64[view] = base64.b64encode(contents).decode()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"File '{view}' không hợp lệ: {e}")

    input_image_url = f"{settings.EXTERNAL_URL}/uploads/mv_{user_id}_{front.filename}"
    resolved_model_name = model_name or Path(front.filename).stem

    try:
        result = await hunyuan3d_mv_service.generate_shape(
            db=db,
            images_base64=images_base64,
            input_image_url=input_image_url,
            remove_background=remove_background,
            num_inference_steps=num_inference_steps,
            octree_resolution=octree_resolution,
            polycount=polycount,
            guidance_scale=guidance_scale,
            model_name=resolved_model_name,
            user_id=user_id,
        )
        return StageResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ────────────────────────────────────────────────────────────────────────────
# STAGE 2 endpoint
# ────────────────────────────────────────────────────────────────────────────

@router.post("/generate-texture-mv", response_model=StageResponse)
async def generate_texture_mv(
    request: TextureRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_uid),
):
    """
    ## Stage 2 — Sơn texture lên white mesh

    Yêu cầu Stage 1 (`generate-shape-mv`) đã **completed**.

    Khi `status = completed`:
    - Download mesh có texture: `GET /api/v1/download/{job_id}/textured`

    **Thời gian:** ~3-8 phút tùy server/GPU.
    """
    # Validate ảnh front
    try:
        Image.open(BytesIO(base64.b64decode(request.front_image_base64)))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"front_image_base64 không hợp lệ: {e}")

    try:
        result = await hunyuan3d_mv_service.generate_texture(
            db=db,
            shape_job_id=request.shape_job_id,
            front_image_base64=request.front_image_base64,
            texture_4k=request.texture_4k,
            user_id=user_id,
        )
        return StageResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-texture-mv/upload", response_model=StageResponse)
async def generate_texture_mv_upload(
    shape_job_id: str = Form(..., description="job_id của Stage 1"),
    front: UploadFile = File(..., description="Ảnh front để sơn texture"),
    texture_4k: bool = Form(False),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_uid),
):
    """
    ## Stage 2 — Upload file ảnh front trực tiếp

    ```bash
    curl -X POST ".../api/v1/generate-texture-mv/upload" \\
         -H "Authorization: Bearer TOKEN" \\
         -F "shape_job_id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \\
         -F "front=@front.png" \\
         -F "texture_4k=true"
    ```
    """
    try:
        contents = await front.read()
        Image.open(BytesIO(contents))
        front_b64 = base64.b64encode(contents).decode()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"File front không hợp lệ: {e}")

    try:
        result = await hunyuan3d_mv_service.generate_texture(
            db=db,
            shape_job_id=shape_job_id,
            front_image_base64=front_b64,
            texture_4k=texture_4k,
            user_id=user_id,
        )
        return StageResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ────────────────────────────────────────────────────────────────────────────
# Download endpoints
# ────────────────────────────────────────────────────────────────────────────

@router.get("/download/{job_id}/white")
async def download_white_mesh(job_id: str):
    """
    ## Download white mesh (Stage 1 output)

    Tải file `.white.glb` — mesh chưa có texture, dùng để preview hình dạng
    trước khi quyết định chạy Stage 2.

    ```bash
    curl -O .../api/v1/download/{shape_job_id}/white
    ```

    **Tip:** Xem nhanh trên browser tại gltf-viewer.donmccurdy.com
    """
    file_path = Path(settings.DOWNLOAD_DIR) / f"{job_id}.white.glb"

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f"White mesh của job '{job_id}' không tìm thấy. "
                "Kiểm tra lại job_id hoặc đợi Stage 1 completed."
            )
        )

    return FileResponse(
        path=file_path,
        media_type="model/gltf-binary",
        filename=f"{job_id}.white.glb",
        headers={
            "X-Job-Id": job_id,
            "X-Mesh-Stage": "shape-only",
            "X-Has-Texture": "false",
        }
    )


@router.get("/download/{job_id}/textured")
async def download_textured_mesh(job_id: str):
    """
    ## Download textured mesh (Stage 2 output)

    Tải file `.glb` hoàn chỉnh — mesh đã sơn texture PBR.

    ```bash
    curl -O .../api/v1/download/{tex_job_id}/textured
    ```
    """
    file_path = Path(settings.DOWNLOAD_DIR) / f"{job_id}.glb"

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f"Textured mesh của job '{job_id}' không tìm thấy. "
                "Kiểm tra lại job_id hoặc đợi Stage 2 completed."
            )
        )

    return FileResponse(
        path=file_path,
        media_type="model/gltf-binary",
        filename=f"{job_id}.glb",
        headers={
            "X-Job-Id": job_id,
            "X-Mesh-Stage": "textured",
            "X-Has-Texture": "true",
        }
    )


# ────────────────────────────────────────────────────────────────────────────
# Status / worker
# ────────────────────────────────────────────────────────────────────────────

@router.get("/job-status-mv/{job_id}", response_model=JobStatusResponse)
async def get_mv_job_status(job_id: str, db: Session = Depends(get_db)):
    """Poll trạng thái job (dùng cho cả Stage 1 và Stage 2)."""
    try:
        return JobStatusResponse(**await hunyuan3d_mv_service.get_job_status(db, job_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/worker-status-mv", response_model=WorkerStatusResponse)
async def get_mv_worker_status():
    """Xem pipeline nào đã load, device, số job đang chạy."""
    return hunyuan3d_mv_service.get_worker_status()


@router.post("/worker-mv/init-shape")
async def init_shape_pipeline():
    """Load shape pipeline thủ công (Stage 1)."""
    try:
        await hunyuan3d_mv_service.initialize_shape_pipeline()
        return {"status": "success", "message": "Shape pipeline loaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/worker-mv/init-texture")
async def init_texture_pipeline():
    """Load texture pipeline thủ công (Stage 2)."""
    try:
        await hunyuan3d_mv_service.initialize_tex_pipeline()
        return {"status": "success", "message": "Texture pipeline loaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/worker-mv/unload-shape")
async def unload_shape_pipeline():
    """
    Unload shape pipeline khỏi VRAM (khi user không cần Stage 2 nữa).
    """
    try:
        hunyuan3d_mv_service.unload_shape_pipeline()
        return {"status": "success", "message": "Shape pipeline unloaded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ────────────────────────────────────────────────────────────────────────────
# SSE progress endpoint
# ────────────────────────────────────────────────────────────────────────────

@router.get("/job-progress-sse/{job_id}")
async def job_progress_sse(job_id: str):
    """
    SSE stream progress cho 1 job cụ thể.

    Client nên gọi sau khi có `job_id` từ Stage 1 / Stage 2.
    Response: `text/event-stream` theo chuẩn SSE, mỗi event có:
      - event: progress | completed | failed | heartbeat
      - data:  JSON (stringified)
    """
    # Lấy queue hiện có, nếu chưa có (client connect sớm) thì tạo mới
    queue = hunyuan3d_mv_service.get_queue(job_id)
    if queue is None:
        queue = hunyuan3d_mv_service.create_queue(job_id)

    async def event_generator():
        try:
            while True:
                item = await queue.get()
                event = item.get("event", "message")
                data = item.get("data", {})
                payload = f"event: {event}\n" \
                          f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                yield payload.encode("utf-8")
        except asyncio.CancelledError:
            # client disconnect
            pass
        finally:
            # Giải phóng queue khi SSE connection đóng
            hunyuan3d_mv_service.release_queue(job_id)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
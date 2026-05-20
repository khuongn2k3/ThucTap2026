"""
Hunyuan3D-2mv Router - 2 endpoint tách biệt:
  POST /generate-shape-mv   → Stage 1: sinh white mesh
  POST /generate-texture-mv → Stage 2: sơn texture lên white mesh
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from pathlib import Path
import base64
from io import BytesIO
from PIL import Image
import asyncio
import json

from app.config import settings
from app.models.base_db import get_db
from app.security.security import get_auth_context, AuthContext
from app.models.user import User
from app.models.task import ModelJob
from app.services.hunyuan3d_mv_service import hunyuan3d_mv_service

import uuid

def _save_mv_images(user_id: Optional[int], images_b64: Dict[str, str]) -> Dict[str, str]:
    base_dir = Path(settings.UPLOAD_TEMP_DIR) / "mv"
    base_dir.mkdir(parents=True, exist_ok=True)

    job_dir = base_dir / str(uuid.uuid4())
    job_dir.mkdir(parents=True, exist_ok=True)

    urls = {}
    for view, b64 in images_b64.items():
        data = base64.b64decode(b64)
        filename = f"{view}.png"
        path = job_dir / filename
        path.write_bytes(data)

        urls[view] = f"{settings.EXTERNAL_URL}/uploads/mv/{job_dir.name}/{filename}"

    return urls


def _load_b64(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    rel = url.split("/uploads/")[-1]
    path = Path(settings.UPLOAD_TEMP_DIR) / rel
    if not path.exists():
        return None
    return base64.b64encode(path.read_bytes()).decode()


router = APIRouter()


# ────────────────────────────────────────────────────────────────────────────
# Token deduction
# ────────────────────────────────────────────────────────────────────────────

_PRICING_FILE = Path(__file__).resolve().parent.parent / "pricing.json"
_PRICING_DEFAULTS = {"stage1_tokens": 25, "stage2_tokens": 25}

def _get_pricing() -> dict:
    try:
        if _PRICING_FILE.exists():
            return {**_PRICING_DEFAULTS, **json.loads(_PRICING_FILE.read_text())}
    except Exception:
        pass
    return _PRICING_DEFAULTS.copy()

def TOKENS_PER_SHAPE()   -> int: return _get_pricing()["stage1_tokens"]
def TOKENS_PER_TEXTURE() -> int: return _get_pricing()["stage2_tokens"]

def _deduct_cost(auth: AuthContext, db: Session, cost: int = 1) -> None:
    """
    JWT  → trừ user.tokens (báo 402 nếu không đủ)
    API Key → quota đã +1 trong _verify_api_key(), không đụng user.tokens
    """
    if auth.type == "jwt" and auth.user_id:
        user = db.query(User).filter(User.id == auth.user_id).first()
        if user is None:
            raise HTTPException(status_code=404, detail="User không tồn tại")
        if (user.tokens or 0) < cost:
            raise HTTPException(
                status_code=402,
                detail=f"Không đủ token. Cần {cost}, hiện có {user.tokens or 0}.",
            )
        user.tokens = (user.tokens or 0) - cost
        db.commit()


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
    # FIX: thêm model_name để nhất quán với upload endpoint
    model_name: Optional[str] = Field(None, description="Tên model (tùy chọn)")
    remove_background: bool = Field(True)
    num_inference_steps: int = Field(100, ge=20, le=100, description="Số bước diffusion")
    octree_resolution:   int = Field(512, ge=200, le=512, description="Độ phân giải mesh")
    polycount: Optional[int] = Field(
        None,
        description="Số faces mục tiêu (decimate). None hoặc <=0 thì bỏ qua decimation.",
        ge=1000,
    )
    guidance_scale: float = Field(
        7.0,
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
                "model_name": "My Model",
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
    texture_4k: bool = Field(
        False,
        description="Nếu True thì upscale texture lên 4K bằng RealESRGAN (nếu có weights)."
    )

    class Config:
        json_schema_extra = {
            "example": {
                "shape_job_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                "texture_4k": False
            }
        }


class StageResponse(BaseModel):
    job_id: str
    status: str
    stage: str
    message: str
    shape_job_id: Optional[str] = None   # chỉ có ở Stage 2 response
    eta_shape: Optional[float] = None    # ETA stage 1 (giây)
    eta_texture: Optional[float] = None  # ETA stage 2 (giây)


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


# FIX: thêm current_resources để khớp với get_worker_status() trả về
class WorkerStatusResponse(BaseModel):
    shape_pipeline_loaded:   bool
    texture_pipeline_loaded: bool
    device:                  str
    active_jobs:             int
    mv_available:            bool
    model_path:              str
    current_resources:       Dict[str, Any] = {}


# ────────────────────────────────────────────────────────────────────────────
# STAGE 1 endpoint
# ────────────────────────────────────────────────────────────────────────────

@router.post("/generate-shape-mv", response_model=StageResponse)
async def generate_shape_mv(
    request: ShapeRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
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

    _deduct_cost(auth, db, TOKENS_PER_SHAPE())
    saved_urls = _save_mv_images(auth.user_id, request.images_base64)
    input_image_url = ""

    try:
        result = await hunyuan3d_mv_service.generate_shape(
            db=db,
            images_base64=request.images_base64,
            input_image_url=input_image_url,
            remove_background=request.remove_background,
            num_inference_steps=request.num_inference_steps,
            octree_resolution=request.octree_resolution,
            polycount=request.polycount,
            guidance_scale=request.guidance_scale,
            # FIX: truyền model_name (trước đây bị bỏ sót ở JSON endpoint)
            model_name=request.model_name,
            user_id=auth.user_id,

            front_image_url=saved_urls.get("front"),
            left_image_url=saved_urls.get("left"),
            right_image_url=saved_urls.get("right"),
            back_image_url=saved_urls.get("back"),
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
    auth: AuthContext = Depends(get_auth_context),
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

    _deduct_cost(auth, db, TOKENS_PER_SHAPE())
    saved_urls = _save_mv_images(auth.user_id, images_base64)
    input_image_url = ""
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
            user_id=auth.user_id,

            front_image_url=saved_urls.get("front"),
            left_image_url=saved_urls.get("left"),
            right_image_url=saved_urls.get("right"),
            back_image_url=saved_urls.get("back"),
        )
        result["eta_shape"]   = hunyuan3d_mv_service._get_eta("shape")
        result["eta_texture"] = hunyuan3d_mv_service._get_eta("texture")
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
    auth: AuthContext = Depends(get_auth_context),
):
    """
    ## Stage 2 — Sơn texture lên white mesh

    Yêu cầu Stage 1 (`generate-shape-mv`) đã **completed**.

    Khi `status = completed`:
    - Download mesh có texture: `GET /api/v1/download/{job_id}/textured`

    **Thời gian:** ~3-8 phút tùy server/GPU.
    """
    job = db.query(ModelJob).filter(ModelJob.job_id == request.shape_job_id)
    # JWT: enforce ownership — chỉ cho xem job của chính mình
    # API Key: không filter user_id vì key có thể không gắn owner (user_id=None)
    if auth.type == "jwt" and auth.user_id is not None:
        job = job.filter(ModelJob.user_id == auth.user_id)
    job = job.first()
    if not job:
        raise HTTPException(status_code=404, detail="Job không tồn tại")

    front_b64 = _load_b64(job.front_image_url)
    if not front_b64:
        raise HTTPException(status_code=400, detail="Không tìm thấy ảnh front để texture")

    images_base64 = {}
    for view, url in {
        "left": job.left_image_url,
        "right": job.right_image_url,
        "back": job.back_image_url,
    }.items():
        b64 = _load_b64(url)
        if b64:
            images_base64[view] = b64

    _deduct_cost(auth, db, TOKENS_PER_TEXTURE())

    try:
        result = await hunyuan3d_mv_service.generate_texture(
            db=db,
            shape_job_id=request.shape_job_id,
            front_image_base64=front_b64,
            texture_4k=request.texture_4k,
            user_id=auth.user_id,
            images_base64=images_base64 or None,
        )
        result["eta_shape"]   = hunyuan3d_mv_service._get_eta("shape")
        result["eta_texture"] = hunyuan3d_mv_service._get_eta("texture")
        return StageResponse(**result)
    # FIX: ValueError (Stage 1 chưa completed) → 400, không phải 500
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
    auth: AuthContext = Depends(get_auth_context),
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

    # Load left/right/back từ DB (đã lưu ở Stage 1)
    job = db.query(ModelJob).filter(ModelJob.job_id == shape_job_id)
    # JWT: enforce ownership; API Key: không filter user_id (key có thể không có owner)
    if auth.type == "jwt" and auth.user_id is not None:
        job = job.filter(ModelJob.user_id == auth.user_id)
    job = job.first()
    images_base64: Dict[str, str] = {}
    if job:
        for view, url in {
            "left":  job.left_image_url,
            "right": job.right_image_url,
            "back":  job.back_image_url,
        }.items():
            b64 = _load_b64(url)
            if b64:
                images_base64[view] = b64

    _deduct_cost(auth, db, TOKENS_PER_TEXTURE())

    try:
        result = await hunyuan3d_mv_service.generate_texture(
            db=db,
            shape_job_id=shape_job_id,
            front_image_base64=front_b64,
            texture_4k=texture_4k,
            user_id=auth.user_id,
            images_base64=images_base64 or None,
        )
        result["eta_shape"]   = hunyuan3d_mv_service._get_eta("shape")
        result["eta_texture"] = hunyuan3d_mv_service._get_eta("texture")
        return StageResponse(**result)
    # FIX: ValueError (Stage 1 chưa completed) → 400, không phải 500
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ────────────────────────────────────────────────────────────────────────────
# FULL PIPELINE endpoint (Stage 1 + Stage 2 trong 1 lần gọi)
# ────────────────────────────────────────────────────────────────────────────

class FullPipelineRequest(BaseModel):
    """Stage 1 + Stage 2 liên tiếp trong 1 lần gọi."""
    images_base64: Dict[str, str] = Field(
        ...,
        description='Ảnh base64 theo góc. "front" bắt buộc, "left"/"back"/"right" tùy chọn.'
    )
    model_name: Optional[str] = Field(None, description="Tên model (tùy chọn)")
    remove_background: bool = Field(True)
    num_inference_steps: int = Field(50, ge=20, le=100)
    octree_resolution:   int = Field(380, ge=200, le=512)
    polycount: Optional[int] = Field(None, ge=1000)
    guidance_scale: float = Field(5.0, ge=0.1, le=20.0)
    texture_4k: bool = Field(False, description="Upscale texture lên 4K sau Stage 2")

    class Config:
        json_schema_extra = {
            "example": {
                "images_base64": {
                    "front": "iVBORw0KGgoAAAA...",
                    "left":  "iVBORw0KGgoAAAA...",
                },
                "model_name": "My Model",
                "remove_background": True,
                "num_inference_steps": 50,
                "octree_resolution": 380,
                "polycount": 30000,
                "guidance_scale": 5.0,
                "texture_4k": False,
            }
        }


class FullPipelineResponse(BaseModel):
    shape_job_id: str
    texture_job_id: str
    status: str
    message: str
    eta_shape: Optional[float] = None
    eta_texture: Optional[float] = None


async def _poll_job_until_done(db, job_id: str, timeout: int = 1800, interval: int = 5) -> dict:
    """Poll job_status cho đến khi completed hoặc failed. Timeout mặc định 30 phút."""
    import asyncio
    elapsed = 0
    while elapsed < timeout:
        result = await hunyuan3d_mv_service.get_job_status(db, job_id)
        if result["status"] == "completed":
            return result
        if result["status"] == "failed":
            raise RuntimeError(f"Job {job_id} thất bại: {result.get('error_message', 'unknown error')}")
        await asyncio.sleep(interval)
        elapsed += interval
    raise TimeoutError(f"Job {job_id} quá thời gian chờ ({timeout}s)")


@router.post("/generate-full-mv", response_model=FullPipelineResponse)
async def generate_full_mv(
    request: FullPipelineRequest,
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    """
    ## Full Pipeline — Stage 1 (shape) + Stage 2 (texture) trong 1 lần gọi

    Gửi ảnh → sinh white mesh → sơn texture → trả về cả 2 job_id.

    Khi hoàn tất:
    - Download white mesh:    `GET /api/v1/download/{shape_job_id}/white`
    - Download textured mesh: `GET /api/v1/download/{texture_job_id}/textured`

    **Thời gian:** ~5-13 phút tổng cộng (Stage 1 + Stage 2).
    """
    if "front" not in request.images_base64:
        raise HTTPException(status_code=400, detail="Thiếu ảnh 'front' trong images_base64")

    for view, b64 in request.images_base64.items():
        try:
            Image.open(BytesIO(base64.b64decode(b64)))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Ảnh '{view}' không hợp lệ: {e}")

    total_cost = TOKENS_PER_SHAPE() + TOKENS_PER_TEXTURE()
    _deduct_cost(auth, db, total_cost)

    saved_urls = _save_mv_images(auth.user_id, request.images_base64)

    # ── Stage 1 ──
    try:
        shape_result = await hunyuan3d_mv_service.generate_shape(
            db=db,
            images_base64=request.images_base64,
            input_image_url="",
            remove_background=request.remove_background,
            num_inference_steps=request.num_inference_steps,
            octree_resolution=request.octree_resolution,
            polycount=request.polycount,
            guidance_scale=request.guidance_scale,
            model_name=request.model_name,
            user_id=auth.user_id,
            front_image_url=saved_urls.get("front"),
            left_image_url=saved_urls.get("left"),
            right_image_url=saved_urls.get("right"),
            back_image_url=saved_urls.get("back"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stage 1 lỗi: {e}")

    shape_job_id = shape_result["job_id"]

    # ── Đợi Stage 1 xong ──
    try:
        await _poll_job_until_done(db, shape_job_id)
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # ── Stage 2 ──
    front_b64 = request.images_base64["front"]
    side_images = {k: v for k, v in request.images_base64.items() if k != "front"}

    try:
        texture_result = await hunyuan3d_mv_service.generate_texture(
            db=db,
            shape_job_id=shape_job_id,
            front_image_base64=front_b64,
            texture_4k=request.texture_4k,
            user_id=auth.user_id,
            images_base64=side_images or None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Stage 2 lỗi: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stage 2 lỗi: {e}")

    return FullPipelineResponse(
        shape_job_id=shape_job_id,
        texture_job_id=texture_result["job_id"],
        status="processing",
        message="Stage 1 completed. Stage 2 đang chạy. Poll /job-status-mv/{texture_job_id} để biết khi xong.",
        eta_shape=hunyuan3d_mv_service._get_eta("shape"),
        eta_texture=hunyuan3d_mv_service._get_eta("texture"),
    )


# ────────────────────────────────────────────────────────────────────────────
# FULL PIPELINE — Stage 1 + Stage 2 trong 1 lần gọi (upload variant, async)
# ────────────────────────────────────────────────────────────────────────────

async def _auto_run_texture(shape_job_id: str, front_b64: str, texture_4k: bool,
                             user_id: Optional[int], side_images: Dict[str, str]):
    """Background task: đợi Stage 1 xong rồi tự chạy Stage 2."""
    import asyncio
    from app.models.base_db import SessionLocal
    db = SessionLocal()
    try:
        for _ in range(360):  # poll tối đa 30 phút
            result = await hunyuan3d_mv_service.get_job_status(db, shape_job_id)
            if result["status"] == "completed":
                break
            if result["status"] == "failed":
                return
            await asyncio.sleep(5)
        else:
            return  # timeout
        await hunyuan3d_mv_service.generate_texture(
            db=db,
            shape_job_id=shape_job_id,
            front_image_base64=front_b64,
            texture_4k=texture_4k,
            user_id=user_id,
            images_base64=side_images or None,
        )
    finally:
        db.close()


@router.post("/generate-full-mv/upload", response_model=FullPipelineResponse)
async def generate_full_mv_upload(
    front: UploadFile = File(..., description="Ảnh góc trước (bắt buộc)"),
    left:  Optional[UploadFile] = File(None),
    back:  Optional[UploadFile] = File(None),
    right: Optional[UploadFile] = File(None),
    model_name: Optional[str] = Form(None),
    remove_background: bool = Form(True),
    num_inference_steps: int = Form(50),
    octree_resolution:   int = Form(380),
    polycount: Optional[int] = Form(None),
    guidance_scale: float = Form(5.0),
    texture_4k: bool = Form(False),
    db: Session = Depends(get_db),
    auth: AuthContext = Depends(get_auth_context),
):
    """
    ## Full Pipeline — Stage 1 + Stage 2 trong 1 lần gọi

    ```bash
    curl -X POST ".../api/v1/generate-full-mv/upload" \\
         -H "X-API-Key: sk_live_xxx" \\
         -F "front=@front.png" \\
         -F "left=@left.png" \\
         -F "right=@right.png" \\
         -F "back=@back.png" \\
         -F "texture_4k=true"
    ```

    Trả về ngay `shape_job_id` + `texture_job_id`.
    Poll SSE `texture_job_id` để biết khi xong, rồi download.
    """
    images_base64: Dict[str, str] = {}
    for view, upload in {"front": front, "left": left, "back": back, "right": right}.items():
        if upload is None:
            continue
        try:
            contents = await upload.read()
            Image.open(BytesIO(contents))
            images_base64[view] = base64.b64encode(contents).decode()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"File '{view}' không hợp lệ: {e}")

    total_cost = TOKENS_PER_SHAPE() + TOKENS_PER_TEXTURE()
    _deduct_cost(auth, db, total_cost)

    saved_urls = _save_mv_images(auth.user_id, images_base64)
    resolved_model_name = model_name or Path(front.filename).stem

    # Stage 1
    try:
        shape_result = await hunyuan3d_mv_service.generate_shape(
            db=db,
            images_base64=images_base64,
            input_image_url="",
            remove_background=remove_background,
            num_inference_steps=num_inference_steps,
            octree_resolution=octree_resolution,
            polycount=polycount,
            guidance_scale=guidance_scale,
            model_name=resolved_model_name,
            user_id=auth.user_id,
            front_image_url=saved_urls.get("front"),
            left_image_url=saved_urls.get("left"),
            right_image_url=saved_urls.get("right"),
            back_image_url=saved_urls.get("back"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stage 1 lỗi: {e}")

    shape_job_id = shape_result["job_id"]


    # Chạy Stage 2 ở background
    front_b64 = images_base64["front"]
    side_images = {k: v for k, v in images_base64.items() if k != "front"}
    import asyncio
    asyncio.create_task(_auto_run_texture(
        shape_job_id=shape_job_id,
        front_b64=front_b64,
        texture_4k=texture_4k,
        user_id=auth.user_id,
        side_images=side_images,
    ))

    return FullPipelineResponse(
        shape_job_id=shape_job_id,
        texture_job_id="pending",
        status="processing",
        message="Stage 1 đang chạy. Stage 2 sẽ tự động chạy sau. Poll SSE texture_job_id để theo dõi.",
        eta_shape=hunyuan3d_mv_service._get_eta("shape"),
        eta_texture=hunyuan3d_mv_service._get_eta("texture"),
    )


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
            "Cache-Control": "public, max-age=31536000, immutable",
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
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Job-Id": job_id,
            "X-Mesh-Stage": "textured",
            "X-Has-Texture": "true",
        }
    )


# ────────────────────────────────────────────────────────────────────────────
# Mesh metrics (on-demand)
# ────────────────────────────────────────────────────────────────────────────

@router.get("/mesh-metrics/{job_id}")
async def get_mesh_metrics(job_id: str):
    """
    ## Tính mesh metrics cho job (on-demand)

    Trả về thông số chất lượng mesh: vertex/face count, watertight, UV, texture...

    Ưu tiên file textured (.glb), fallback về white mesh (.white.glb).

    ```bash
    curl .../api/v1/mesh-metrics/{job_id}
    ```
    """
    from app.services.hunyuan3d_mv_service import _build_mesh_metrics

    tex_path   = Path(settings.DOWNLOAD_DIR) / f"{job_id}.glb"
    white_path = Path(settings.DOWNLOAD_DIR) / f"{job_id}.white.glb"

    if tex_path.exists():
        glb_path = tex_path
    elif white_path.exists():
        glb_path = white_path
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Không tìm thấy GLB file cho job '{job_id}'"
        )

    loop = asyncio.get_running_loop()
    metrics = await loop.run_in_executor(None, _build_mesh_metrics, glb_path)
    return metrics


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
async def job_progress_sse(job_id: str, request: Request, db: Session = Depends(get_db)):
    """
    SSE stream progress cho 1 job cụ thể.

    Client nên gọi sau khi có `job_id` từ Stage 1 / Stage 2.
    Response: `text/event-stream` theo chuẩn SSE, mỗi event có:
      - event: progress | completed | failed | heartbeat
      - data:  JSON (stringified)

    Stream tự đóng sau khi nhận event `completed` hoặc `failed`.
    """
    # Lấy Origin từ request để trả lại đúng header CORS cho StreamingResponse
    # (FastAPI CORS middleware không inject headers vào StreamingResponse đáng tin cậy)
    origin = request.headers.get("origin", "*")

    sse_headers = {
        "Content-Type":              "text/event-stream",
        "Cache-Control":             "no-cache",
        "X-Accel-Buffering":         "no",
        "Access-Control-Allow-Origin":      origin,
        "Access-Control-Allow-Credentials": "true",
    }
    # FIX: Nếu job đã xong trước khi client connect SSE → trả ngay 1 event rồi đóng.
    # Tránh trường hợp tạo queue rỗng → client treo mãi không có event nào.
    try:
        status_data = await hunyuan3d_mv_service.get_job_status(db, job_id)
    except Exception:
        status_data = {}

    terminal_status = status_data.get("status") in ("completed", "failed", "not_found")

    if terminal_status:
        event_name = status_data.get("status", "failed")
        # "not_found" không phải SSE event chuẩn → map thành "failed"
        if event_name == "not_found":
            event_name = "failed"
            status_data.setdefault("error", "Job không tồn tại")

        async def one_shot_generator():
            payload = (
                f"event: {event_name}\n"
                f"data: {json.dumps(status_data, ensure_ascii=False)}\n\n"
            )
            yield payload.encode("utf-8")

        return StreamingResponse(
            one_shot_generator(),
            media_type="text/event-stream",
            headers=sse_headers,
        )

    # Job đang chạy → lấy queue hiện có, hoặc tạo mới nếu client connect trước service
    queue = hunyuan3d_mv_service.get_queue(job_id)
    if queue is None:
        queue = hunyuan3d_mv_service.create_queue(job_id)

    async def event_generator():
        try:
            while True:
                try:
                    # Heartbeat mỗi 20s để giữ kết nối qua Cloudflare/nginx
                    # (Cloudflare trycloudflare.com idle timeout ~100s)
                    item = await asyncio.wait_for(queue.get(), timeout=20.0)
                except asyncio.TimeoutError:
                    # Không có event mới → gửi comment heartbeat (chuẩn SSE)
                    yield b"event: heartbeat\ndata: {}\n\n"
                    continue

                event = item.get("event", "message")
                data  = item.get("data", {})
                payload = (
                    f"event: {event}\n"
                    f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                )
                yield payload.encode("utf-8")

                # Đóng stream sau completed/failed
                # Frontend nhận tín hiệu rõ ràng → trigger Stage 2 hoặc hiện lỗi
                if event in ("completed", "failed"):
                    break

        except asyncio.CancelledError:
            # Client disconnect chủ động
            pass
        finally:
            # Giải phóng queue khi SSE connection đóng
            hunyuan3d_mv_service.release_queue(job_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=sse_headers,
    )
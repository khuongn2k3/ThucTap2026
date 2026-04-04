from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Query
from typing import Optional
from sqlalchemy.orm import Session
from pathlib import Path
import uuid, shutil

from app.models.base_db import get_db
from app.security.security import get_current_user
from app.models.user import User
from app.models.task import ModelJob
from app.services.hunyuan3d_mv_service import hunyuan3d_mv_service
from app.config import settings

# Thumbnail renderer
try:
    from app.services.thumbnail_renderer import render_thumbnail as _render_thumbnail
    _HAS_RENDERER = True
except ImportError:
    _HAS_RENDERER = False

GALLERY_DIR = Path("utils/gallery")
GALLERY_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(tags=["My Jobs"])

def _auto_thumbnail(model_abs: Path) -> str | None:
    if not _HAS_RENDERER:
        return None
    try:
        webp_bytes = _render_thumbnail(str(model_abs))
        if not webp_bytes:
            return None
        name = f"{uuid.uuid4().hex}_thumb.webp"
        dest = GALLERY_DIR / "images" / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(webp_bytes)
        return f"images/{name}"
    except Exception as e:
        print(f"[thumb] render failed: {e}")
        return None

@router.get("/my-jobs")
async def list_my_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jobs = await hunyuan3d_mv_service.get_user_jobs(db, current_user.id)
    return {"jobs": jobs}

@router.post("/my-jobs/upload-model")
async def upload_model(
    model: UploadFile = File(..., description="GLB hoặc STL"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ext = Path(model.filename).suffix.lower()
    if ext not in {".glb", ".stl"}:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận GLB hoặc STL")

    save_dir = Path(settings.DOWNLOAD_DIR)
    save_dir.mkdir(parents=True, exist_ok=True)

    job_id = str(uuid.uuid4())
    out_path = save_dir / f"{job_id}{ext}"
    with out_path.open("wb") as f:
        shutil.copyfileobj(model.file, f)

    output_url = f"{settings.EXTERNAL_URL}/download-static/{job_id}{ext}"
    model_name = Path(model.filename).stem or "Uploaded Model"

    thumb_rel = _auto_thumbnail(out_path)
    thumb_url = f"{settings.EXTERNAL_URL}/gallery-files/{thumb_rel}" if thumb_rel else None

    job = ModelJob(
        user_id=current_user.id,
        job_id=job_id,
        status="completed",
        input_image_url=thumb_url or output_url,
        output_model_url=output_url,
        has_texture=(ext == ".glb"),
        model_name=model_name,
    )
    db.add(job); db.commit()

    return {
        "job_id": job_id,
        "output_model_url": output_url,
        "model_name": model_name,
        "thumbnail_url": thumb_url,
    }

@router.delete("/my-jobs/{job_id}")
async def delete_my_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await hunyuan3d_mv_service.delete_job(db, job_id, user_id=current_user.id)
    if result.get("status") != "success":
        raise HTTPException(status_code=404, detail=result.get("error", "Job not found"))
    return result

@router.delete("/job/{job_id}")
async def delete_job_alias(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await hunyuan3d_mv_service.delete_job(db, job_id, user_id=current_user.id)
    if result.get("status") != "success":
        raise HTTPException(status_code=404, detail=result.get("error", "Job not found"))
    return result

@router.get("/my-jobs/{job_id}/export")
async def export_my_job(
    job_id: str,
    format: str = Query("glb", regex="^(glb|obj|stl)$"),
    tex_res: Optional[str] = Query(None, regex="^(512|1k|2k|4k)$"),
    include_skeleton: bool = Query(True),
    bottom_center_pivot: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export private job model sang format khác (GLB/OBJ/STL)."""
    from fastapi.responses import StreamingResponse
    from fastapi import Query as _Query
    import io
    from pathlib import Path as _Path
    from app.services.convert_service import (
        obj_to_glb, glb_to_obj_zip, to_stl, stl_to_obj,
        strip_skeleton_glb, apply_bottom_center_pivot_glb,
    )
    from app.config import settings as _settings

    job = db.query(ModelJob).filter(
        ModelJob.job_id == job_id,
        ModelJob.user_id == current_user.id,
    ).first()
    if not job:
        raise HTTPException(404, "Job không tồn tại")
    if not job.output_model_url:
        raise HTTPException(404, "File model không tồn tại")

    # Resolve đường dẫn file thực trên server
    DOWNLOAD_DIR = _Path(_settings.DOWNLOAD_DIR)
    src_ext = _Path(job.output_model_url).suffix.lower()  # .glb | .obj | .stl

    # Generated jobs có URL dạng .../download/{id}/white hoặc .../download/{id}/textured
    # → không có extension → tìm file thực trên disk theo thứ tự ưu tiên
    if not src_ext:
        _candidates = [
            (DOWNLOAD_DIR / f"{job_id}.glb",       ".glb"),
            (DOWNLOAD_DIR / f"{job_id}.white.glb", ".glb"),
            (DOWNLOAD_DIR / f"{job_id}.stl",       ".stl"),
            (DOWNLOAD_DIR / f"{job_id}.obj",       ".obj"),
        ]
        _found = next((_f for _f, _e in _candidates if _f.exists()), None)
        if _found is None:
            raise HTTPException(404, "File không tồn tại trên server")
        job_file = _found
        src_ext  = _found.suffix.lower()
    else:
        job_file = DOWNLOAD_DIR / f"{job_id}{src_ext}"
        if not job_file.exists():
            raise HTTPException(404, "File không tồn tại trên server")

    src_fmt = src_ext.lstrip(".")

    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in (job.model_name or job_id))
    TEX_RES_MAP = {"512": 512, "1k": 1024, "2k": 2048, "4k": 4096}

    def _postprocess_glb(data: bytes) -> bytes:
        if not include_skeleton:
            data = strip_skeleton_glb(data)
        if bottom_center_pivot:
            data = apply_bottom_center_pivot_glb(data)
        return data

    # ── Cùng format ────────────────────────────────────────────────────────
    if format == src_fmt:
        if tex_res and src_fmt in ("glb", "obj"):
            max_dim = TEX_RES_MAP[tex_res]
            from app.routers.gallery import _downscale_glb_textures, _downscale_obj_bundle_zip
            if src_fmt == "glb":
                data = _postprocess_glb(_downscale_glb_textures(job_file.read_bytes(), max_dim))
                return StreamingResponse(io.BytesIO(data), media_type="model/gltf-binary",
                    headers={"Content-Disposition": f'attachment; filename="{safe_name}.glb"'})
            else:
                data = _downscale_obj_bundle_zip(job_file.parent, safe_name, max_dim)
                return StreamingResponse(io.BytesIO(data), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{safe_name}_obj.zip"'})

        if src_fmt == "glb" and (not include_skeleton or bottom_center_pivot):
            data = _postprocess_glb(job_file.read_bytes())
            return StreamingResponse(io.BytesIO(data), media_type="model/gltf-binary",
                headers={"Content-Disposition": f'attachment; filename="{safe_name}.glb"'})

        # Không cần xử lý → stream thẳng file
        def _iter():
            with open(job_file, "rb") as f:
                yield from f
        media = {"glb": "model/gltf-binary", "obj": "text/plain", "stl": "model/stl"}.get(src_fmt, "application/octet-stream")
        return StreamingResponse(_iter(), media_type=media,
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.{src_fmt}"'})

    # ── GLB → OBJ ──────────────────────────────────────────────────────────
    if src_fmt == "glb" and format == "obj":
        import tempfile, os as _os
        raw = _postprocess_glb(job_file.read_bytes())
        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as tf:
            tf.write(raw); tmp_glb = tf.name
        try:
            data = glb_to_obj_zip(_Path(tmp_glb), base_name=safe_name)
        finally:
            _os.unlink(tmp_glb)
        return StreamingResponse(io.BytesIO(data), media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}_obj.zip"'})

    # ── GLB → STL ──────────────────────────────────────────────────────────
    if src_fmt == "glb" and format == "stl":
        data = to_stl(job_file, bottom_center_pivot=bottom_center_pivot)
        return StreamingResponse(io.BytesIO(data), media_type="model/stl",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.stl"'})

    # ── OBJ → GLB ──────────────────────────────────────────────────────────
    if src_fmt == "obj" and format == "glb":
        data = _postprocess_glb(obj_to_glb(job_file.parent, job_file.name))
        return StreamingResponse(io.BytesIO(data), media_type="model/gltf-binary",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.glb"'})

    # ── OBJ → STL ──────────────────────────────────────────────────────────
    if src_fmt == "obj" and format == "stl":
        data = to_stl(job_file, bottom_center_pivot=bottom_center_pivot)
        return StreamingResponse(io.BytesIO(data), media_type="model/stl",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.stl"'})

    # ── STL → GLB ──────────────────────────────────────────────────────────
    if src_fmt == "stl" and format == "glb":
        import trimesh as _trimesh
        scene = _trimesh.load(str(job_file), force="scene", process=False)
        data  = _postprocess_glb(scene.export(file_type="glb"))
        return StreamingResponse(io.BytesIO(data), media_type="model/gltf-binary",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.glb"'})

    # ── STL → OBJ ──────────────────────────────────────────────────────────
    if src_fmt == "stl" and format == "obj":
        data = stl_to_obj(job_file, base_name=safe_name, bottom_center_pivot=bottom_center_pivot)
        return StreamingResponse(io.BytesIO(data), media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.obj"'})

    raise HTTPException(400, f"Không hỗ trợ convert từ {src_fmt} sang {format}")
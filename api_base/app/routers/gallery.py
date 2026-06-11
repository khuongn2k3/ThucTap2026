"""
Gallery Router
- Public: GET /gallery — danh sách model đã được admin duyệt
- User:   POST /gallery/submit — upload model chờ duyệt
- User:   POST /gallery/{id}/like — like model
- User:   DELETE /gallery/{id}/like — unlike model
- User:   POST /gallery/{id}/collect — collect (star) model
- User:   DELETE /gallery/{id}/collect — uncollect model
- Admin:  GET /admin/gallery/pending — danh sách chờ duyệt
- Admin:  PATCH /admin/gallery/{id}/approve — duyệt
- Admin:  PATCH /admin/gallery/{id}/reject — từ chối
"""
import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

# Auto-thumbnail renderer (trimesh + pyrender, optional)
try:
    from app.services.thumbnail_renderer import render_thumbnail as _render_thumbnail
    _HAS_RENDERER = True
except ImportError:
    _HAS_RENDERER = False

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.models.task import ModelJob
from app.config import settings
from app.models.base_db import get_db
from app.models.gallery_submission import (
    GallerySubmission, SubmissionCategory,
    GalleryLike, GalleryCollection
)
from app.models.user import User
from app.security.security import get_current_admin, get_current_user, get_current_user_optional

router = APIRouter(prefix="/gallery", tags=["Gallery"])

# Thư mục lưu file gallery
GALLERY_DIR = Path("utils/gallery")
GALLERY_DIR.mkdir(parents=True, exist_ok=True)


# ============================================
# Schemas
# ============================================

class CategoryOut(BaseModel):
    category: str

    class Config:
        from_attributes = True


class SubmissionOut(BaseModel):
    id: int
    uuid: str = ""
    user: str
    avatar: str
    model_name: str
    tags: Optional[str] = None
    image_url: Optional[str] = None        # ảnh user upload
    thumbnail_url: Optional[str] = None    # ảnh render từ 3D (dùng cho gallery card)
    model_url: Optional[str] = None
    is_public: bool
    categories: List[str] = []
    created_at: Optional[str] = None
    likes: int = 0
    user_liked: bool = False
    user_collected: bool = False

    class Config:
        from_attributes = True


class GalleryResponse(BaseModel):
    models: List[SubmissionOut]
    total: int
    limit: int
    offset: int


# ============================================
# Helper
# ============================================

def _to_submission_out(
    sub: GallerySubmission,
    current_user_id: Optional[int] = None
) -> SubmissionOut:
    user_name = sub.user.name if sub.user else "Anonymous"
    avatar = user_name[:2].upper()
    created_str = sub.created_at.strftime("%Y-%m-%d") if sub.created_at else None
    cats = [c.category for c in sub.categories]

    user_liked = False
    user_collected = False
    if current_user_id:
        user_liked = any(lk.user_id == current_user_id for lk in sub.likes)
        user_collected = any(cl.user_id == current_user_id for cl in sub.collections)

    return SubmissionOut(
        id=sub.id,
        uuid=sub.uuid or "",
        user=user_name,
        avatar=avatar,
        model_name=sub.model_name,
        tags=sub.tags,
        image_url=(sub.image_url if (sub.image_url or "").startswith("http") else f"{settings.EXTERNAL_URL}/gallery-files/{sub.image_url}") if sub.image_url else None,
        thumbnail_url=(sub.thumbnail_url if (sub.thumbnail_url or "").startswith("http") else f"{settings.EXTERNAL_URL}/gallery-files/{sub.thumbnail_url}") if sub.thumbnail_url else None,
        model_url=(sub.model_url if (sub.model_url or "").startswith("http") else f"{settings.EXTERNAL_URL}/gallery-files/{sub.model_url}") if sub.model_url else None,
        is_public=sub.is_public,
        categories=cats,
        created_at=created_str,
        likes=sub.likes_count,
        user_liked=user_liked,
        user_collected=user_collected,
    )


def _auto_thumbnail(model_rel: str) -> Optional[str]:
    """
    Render thumbnail .webp từ file 3D, lưu vào images/, trả về đường dẫn tương đối.
    Trả về None nếu thất bại (thiếu thư viện, file lỗi...).
    """
    if not _HAS_RENDERER:
        return None
    try:
        model_full = GALLERY_DIR / model_rel
        # OBJ bundle: model_rel = "models/<bundle_id>/<file>.obj"
        webp_bytes = _render_thumbnail(str(model_full))
        if not webp_bytes:
            return None
        thumb_name = f"{uuid.uuid4().hex}_thumb.webp"
        thumb_dest = GALLERY_DIR / "images" / thumb_name
        thumb_dest.parent.mkdir(parents=True, exist_ok=True)
        thumb_dest.write_bytes(webp_bytes)
        logger.info(f"[thumbnail] Generated: images/{thumb_name}")
        return f"images/{thumb_name}"
    except Exception as e:
        logger.warning(f"[thumbnail] Auto-thumbnail thất bại: {e}")
        return None


    """Lưu file upload (non-OBJ bundle), trả về tên file đã lưu."""
    ext = Path(upload.filename).suffix.lower()
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = GALLERY_DIR / subfolder / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return f"{subfolder}/{filename}"


def _save_file(upload: UploadFile, subfolder: str) -> str:
    """Lưu file upload (non-OBJ bundle), trả về tên file đã lưu."""
    ext = Path(upload.filename).suffix.lower()
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = GALLERY_DIR / subfolder / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return f"{subfolder}/{filename}"


def _save_obj_bundle(
    model: UploadFile,
    mtl: Optional[UploadFile],
    textures: List[UploadFile],
) -> str:
    """
    Lưu OBJ + MTL + textures vào cùng 1 subfolder (bundle_id).
    Giữ nguyên tên file gốc để MTL và OBJ tìm được nhau.
    Trả về đường dẫn tương đối của file OBJ.
    """
    bundle_id = uuid.uuid4().hex
    bundle_dir = GALLERY_DIR / "models" / bundle_id
    bundle_dir.mkdir(parents=True, exist_ok=True)

    # Lưu OBJ với tên gốc
    obj_filename = Path(model.filename).name
    obj_dest = bundle_dir / obj_filename
    with obj_dest.open("wb") as f:
        shutil.copyfileobj(model.file, f)

    # Lưu MTL với tên gốc (OBJ sẽ tìm đúng)
    if mtl:
        mtl_filename = Path(mtl.filename).name
        mtl_dest = bundle_dir / mtl_filename
        with mtl_dest.open("wb") as f:
            shutil.copyfileobj(mtl.file, f)

    # Lưu texture files với tên gốc (MTL sẽ tìm đúng)
    allowed_textures = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tga"}
    for tex in (textures or []):
        if Path(tex.filename).suffix.lower() not in allowed_textures:
            continue
        tex_dest = bundle_dir / Path(tex.filename).name
        with tex_dest.open("wb") as f:
            shutil.copyfileobj(tex.file, f)

    return f"models/{bundle_id}/{obj_filename}"


# ============================================
# Public endpoints
# ============================================

@router.get("", response_model=GalleryResponse)
async def get_gallery(
    category: Optional[str] = Query(None),
    sort: Optional[str] = Query(None),   # "most_likes" | "newest" | None = recommended
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Trả về các model đã được admin duyệt (is_public = true)."""
    current_user_id = current_user.id if current_user else None

    query = (
        db.query(GallerySubmission)
        .filter(GallerySubmission.is_public == True)
    )

    if category:
        query = query.join(SubmissionCategory).filter(
            SubmissionCategory.category.ilike(category)
        )

    total = query.count()

    if sort == "most_likes":
        query = query.order_by(GallerySubmission.likes_count.desc())
    else:
        # "newest" hoặc mặc định
        query = query.order_by(GallerySubmission.created_at.desc())

    submissions = (
        query
        .limit(limit)
        .offset(offset)
        .all()
    )

    return GalleryResponse(
        models=[_to_submission_out(s, current_user_id) for s in submissions],
        total=total,
        limit=limit,
        offset=offset,
    )


# ============================================
# Like endpoints
# ============================================

@router.post("/{submission_id}/like")
async def like_model(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """User like một model trong gallery."""
    sub = db.query(GallerySubmission).filter(
        GallerySubmission.id == submission_id,
        GallerySubmission.is_public == True
    ).first()
    if not sub:
        raise HTTPException(404, "Model không tồn tại")

    existing = db.query(GalleryLike).filter(
        GalleryLike.user_id == current_user.id,
        GalleryLike.submission_id == submission_id,
    ).first()
    if existing:
        return {"status": "already_liked", "likes": sub.likes_count}

    like = GalleryLike(user_id=current_user.id, submission_id=submission_id)
    db.add(like)
    sub.likes_count = (sub.likes_count or 0) + 1
    db.commit()
    return {"status": "liked", "likes": sub.likes_count}


@router.delete("/{submission_id}/like")
async def unlike_model(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """User unlike một model."""
    sub = db.query(GallerySubmission).filter(
        GallerySubmission.id == submission_id,
    ).first()
    if not sub:
        raise HTTPException(404, "Model không tồn tại")

    existing = db.query(GalleryLike).filter(
        GalleryLike.user_id == current_user.id,
        GalleryLike.submission_id == submission_id,
    ).first()
    if not existing:
        return {"status": "not_liked", "likes": sub.likes_count}

    db.delete(existing)
    sub.likes_count = max(0, (sub.likes_count or 1) - 1)
    db.commit()
    return {"status": "unliked", "likes": sub.likes_count}


# ============================================
# Collection (star) endpoints
# ============================================

@router.post("/{identifier}/collect")
async def collect_model(
    identifier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cho phép collect bằng:
    - submission_id (số)
    - job_id (UUID) của My Assets: nếu chưa có submission thì tự tạo với source='upload' (không vào pending admin).
    """
    submission = None

    if identifier.isdigit():
        submission = db.query(GallerySubmission).get(int(identifier))
    else:
        job = db.query(ModelJob).filter(ModelJob.job_id == identifier).first()
        if not job:
            raise HTTPException(404, "Job không tồn tại")

        if not job.submission_id:
            sub = GallerySubmission(
                uuid=str(uuid.uuid4()),
                user_id=job.user_id,
                model_name=job.model_name or "Uploaded Model",
                image_url=None,
                thumbnail_url=job.input_image_url,   # thumbnail đã render khi upload
                model_url=job.output_model_url,
                faces=job.faces,
                vertices=job.vertices,
                is_public=False,
                source="collect",                    # KHÔNG vào hàng chờ duyệt admin
            )
            db.add(sub); db.commit(); db.refresh(sub)
            job.submission_id = sub.id
            db.commit()
            submission = sub
        else:
            submission = db.query(GallerySubmission).get(job.submission_id)

    if not submission:
        raise HTTPException(404, "Model không tồn tại")

    exists = (
        db.query(GalleryCollection)
        .filter(
            GalleryCollection.user_id == current_user.id,
            GalleryCollection.submission_id == submission.id,
        )
        .first()
    )
    if exists:
        return {"status": "already_collected", "submission_id": submission.id}

    db.add(GalleryCollection(user_id=current_user.id, submission_id=submission.id))
    db.commit()
    return {"status": "collected", "submission_id": submission.id}


@router.delete("/{submission_id}/collect")
async def uncollect_model(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """User bỏ lưu một model."""
    existing = db.query(GalleryCollection).filter(
        GalleryCollection.user_id == current_user.id,
        GalleryCollection.submission_id == submission_id,
    ).first()
    if not existing:
        return {"status": "not_collected"}

    db.delete(existing)
    db.commit()
    return {"status": "uncollected"}


# ============================================
# Get collected models of current user
# ============================================

@router.get("/collected")
async def get_collected_models(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trả về danh sách model user đã collect (★)."""
    collections = db.query(GalleryCollection).filter(
        GalleryCollection.user_id == current_user.id
    ).all()

    submission_ids = [c.submission_id for c in collections]
    if not submission_ids:
        return {"models": []}

    # Trả về tất cả model user đã collect, kể cả model chưa public (convert3d asset).
    # Đây là endpoint riêng tư — chỉ trả về collection của chính user, không cần lọc is_public.
    submissions = db.query(GallerySubmission).filter(
        GallerySubmission.id.in_(submission_ids)
    ).all()

    return {"models": [_to_submission_out(s, current_user.id) for s in submissions]}


# ============================================
# Get single model by slug (for share URL)
# ============================================

@router.get("/by-slug/{slug}")
async def get_model_by_slug(
    slug: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Lấy model theo slug dạng: ten-model-{uuid}. Dùng cho share URL /3d-model/..."""
    # Slug dạng: plush-cat-f7e69b48-b666-400c-8b21-b9f2f09309b7
    # UUID luôn là 36 ký tự cuối
    uuid_str = slug[-36:] if len(slug) >= 36 else slug

    # Ai có link (UUID) thì xem được — UUID chính là access control.
    # Không cần check is_public: public model ai cũng xem,
    # convert3d model chưa public thì owner share link cho người khác xem được.
    sub = db.query(GallerySubmission).filter(
        GallerySubmission.uuid == uuid_str,
    ).first()
    if not sub:
        raise HTTPException(404, "Model không tồn tại")
    current_user_id = current_user.id if current_user else None
    return _to_submission_out(sub, current_user_id)


# ============================================
# Get submission by id (for share URL building — owner only)
# ============================================

@router.get("/submission/{submission_id}")
async def get_submission_by_id(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy uuid + model_name của submission (private hoặc public) — chỉ chủ sở hữu."""
    sub = db.query(GallerySubmission).filter(
        GallerySubmission.id == submission_id,
        GallerySubmission.user_id == current_user.id,
    ).first()
    if not sub:
        raise HTTPException(404, "Submission không tồn tại")
    return {"id": sub.id, "uuid": sub.uuid, "model_name": sub.model_name}


# ============================================
# Export endpoint (User — chủ sở hữu hoặc public)
# ============================================

# ── Helper: downscale textures trong GLB ─────────────────────────────────────
def _downscale_glb_textures(glb_bytes: bytes, max_dim: int) -> bytes:
    """
    Đọc GLB, resize tất cả ảnh embed xuống max_dim, trả về GLB bytes mới.
    Dùng Pillow. Nếu lỗi thì trả lại bytes gốc.
    """
    import io as _io
    import struct
    import json as _json
    from PIL import Image as _Image

    try:
        if len(glb_bytes) < 20:
            return glb_bytes

        # ── Parse header ────────────────────────────────────────────────────
        magic = struct.unpack_from("<I", glb_bytes, 0)[0]
        if magic != 0x46546C67:
            return glb_bytes  # không phải GLB

        json_chunk_len = struct.unpack_from("<I", glb_bytes, 12)[0]
        # JSON data bắt đầu tại byte 20 (sau 12-byte header + 8-byte chunk header)
        json_bytes = glb_bytes[20: 20 + json_chunk_len]
        gltf = _json.loads(json_bytes)

        # BIN chunk bắt đầu ngay sau JSON chunk
        bin_chunk_offset = 20 + json_chunk_len        # offset của BIN chunk header
        bin_chunk_len    = struct.unpack_from("<I", glb_bytes, bin_chunk_offset)[0]
        bin_data_offset  = bin_chunk_offset + 8       # bỏ qua 8-byte BIN chunk header
        bin_data         = bytearray(glb_bytes[bin_data_offset: bin_data_offset + bin_chunk_len])

        images = gltf.get("images", [])
        bvs    = gltf.get("bufferViews", [])
        if not images or not bvs:
            return glb_bytes

        # ── Xử lý từng ảnh ──────────────────────────────────────────────────
        for img_ref in images:
            bv_idx = img_ref.get("bufferView")
            if bv_idx is None:
                continue
            bv     = bvs[bv_idx]
            off    = bv.get("byteOffset", 0)    # optional trong spec, mặc định = 0
            length = bv.get("byteLength", 0)
            if length == 0:
                continue

            img_bytes = bytes(bin_data[off: off + length])

            # Kiểm tra magic bytes — skip nếu không phải PNG/JPEG/WebP
            is_png  = img_bytes[:8] == b"\x89PNG\r\n\x1a\n"
            is_jpeg = img_bytes[:2] == b"\xff\xd8"
            is_webp = img_bytes[:4] == b"RIFF" and img_bytes[8:12] == b"WEBP"
            if not (is_png or is_jpeg or is_webp):
                logger.debug(f"[downscale_glb] skip unsupported format at bv={bv_idx}")
                continue

            try:
                img = _Image.open(_io.BytesIO(img_bytes))
                w, h = img.size
                if max(w, h) <= max_dim:
                    continue  # đã đủ nhỏ, không cần resize

                scale    = max_dim / max(w, h)
                new_img  = img.resize((int(w * scale), int(h * scale)), _Image.LANCZOS)
                out_buf  = _io.BytesIO()

                if is_png:
                    new_img.save(out_buf, format="PNG", optimize=True)
                    img_ref["mimeType"] = "image/png"
                else:
                    # JPEG/WebP → encode lại JPEG (WebP không phổ biến trong glTF viewers)
                    if new_img.mode in ("RGBA", "P", "LA"):
                        new_img = new_img.convert("RGB")
                    new_img.save(out_buf, format="JPEG", quality=85)
                    img_ref["mimeType"] = "image/jpeg"

                new_bytes = out_buf.getvalue()
                # Align 4 bytes cho BIN chunk
                pad       = (4 - len(new_bytes) % 4) % 4
                new_padded = new_bytes + b"\x00" * pad

                # ── Rebuild bin_data với size mới (không patch in-place) ────
                new_bin = bytearray()
                new_bin += bin_data[:off]
                new_bin += new_padded
                new_bin += bin_data[off + length:]
                delta    = len(new_padded) - length

                # Cập nhật bufferView hiện tại
                bv["byteLength"] = len(new_bytes)  # byteLength = actual bytes, không padding

                # Dịch byteOffset của các bufferView nằm SAU bufferView này
                if delta != 0:
                    for bv2 in bvs:
                        if bv2.get("byteOffset", 0) > off:
                            bv2["byteOffset"] = bv2["byteOffset"] + delta

                bin_data = new_bin
                logger.info(f"[downscale_glb] bv={bv_idx}: {w}x{h} → {int(w*scale)}x{int(h*scale)}")

            except Exception as img_err:
                logger.warning(f"[downscale_glb] skip bv={bv_idx}: {img_err}")
                continue

        # ── Rebuild GLB ──────────────────────────────────────────────────────
        new_json_bytes  = _json.dumps(gltf, separators=(",", ":")).encode()
        pad_json        = (4 - len(new_json_bytes) % 4) % 4
        new_json_padded = new_json_bytes + b" " * pad_json   # JSON padding = spaces

        bin_final    = bytes(bin_data)
        pad_bin      = (4 - len(bin_final) % 4) % 4
        bin_final   += b"\x00" * pad_bin

        total_len = 12 + 8 + len(new_json_padded) + 8 + len(bin_final)
        out = _io.BytesIO()
        out.write(struct.pack("<III", 0x46546C67, 2, total_len))         # GLB header
        out.write(struct.pack("<II",  len(new_json_padded), 0x4E4F534A)) # JSON chunk header
        out.write(new_json_padded)
        out.write(struct.pack("<II",  len(bin_final), 0x004E4942))       # BIN chunk header
        out.write(bin_final)
        result = out.getvalue()
        logger.info(f"[downscale_glb] done: {len(glb_bytes)//1024}KB → {len(result)//1024}KB")
        return result

    except Exception as e:
        logger.warning(f"[downscale_glb] Lỗi: {e} — trả file gốc")
        return glb_bytes


# ── Helper: downscale textures trong OBJ bundle ───────────────────────────────
def _downscale_obj_bundle_zip(bundle_dir: Path, base_name: str, max_dim: int) -> bytes:
    """
    Đọc OBJ bundle (có MTL + textures), resize ảnh, đóng gói thành ZIP.
    """
    import io as _io
    import zipfile
    from PIL import Image as _Image

    tex_exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tga"}
    buf = _io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in bundle_dir.iterdir():
            if f.suffix.lower() in tex_exts:
                try:
                    img = _Image.open(f)
                    w, h = img.size
                    if max(w, h) > max_dim:
                        scale  = max_dim / max(w, h)
                        img    = img.resize((int(w * scale), int(h * scale)), _Image.LANCZOS)
                    ibuf = _io.BytesIO()
                    fmt  = "PNG" if f.suffix.lower() == ".png" else "JPEG"
                    img.save(ibuf, format=fmt, quality=90)
                    zf.writestr(f.name, ibuf.getvalue())
                except Exception:
                    zf.write(f, f.name)
            else:
                zf.write(f, f.name)
    return buf.getvalue()


@router.get("/{submission_id}/export")
async def export_model(
    submission_id: int,
    format: str = Query("glb", regex="^(glb|obj|stl)$"),
    tex_res: Optional[str] = Query(None, regex="^(512|1k|2k|4k)$"),
    include_skeleton: bool = Query(True),
    bottom_center_pivot: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Export model sang định dạng khác.

    Các chiều convert được hỗ trợ:
    - OBJ → GLB : trả file .glb (embed textures)
    - OBJ → STL : trả file .stl (mất texture/material)
    - GLB → OBJ : trả file .zip (model.obj + model.mtl + textures)
    - GLB → STL : trả file .stl (mất texture/material)
    - STL → GLB : trả file .glb
    - STL → OBJ : trả file .obj (STL không có material nên không cần zip)
    - Cùng format + tex_res : downscale texture rồi trả file
    - Cùng format, không tex_res : redirect thẳng file gốc

    Post-processing (chỉ áp dụng cho GLB output):
    - include_skeleton=false : xóa skeleton/skinning data
    - bottom_center_pivot=true : dịch model về pivot đáy-giữa
    """
    from fastapi.responses import StreamingResponse, RedirectResponse
    import io
    from app.services.convert_service import (
        obj_to_glb, glb_to_obj_zip, to_stl, stl_to_obj,
        strip_skeleton_glb, apply_bottom_center_pivot_glb,
    )

    def _postprocess_glb(data: bytes) -> bytes:
        """Áp dụng skeleton-strip và/hoặc pivot sau khi có GLB bytes."""
        if not include_skeleton:
            data = strip_skeleton_glb(data)
        if bottom_center_pivot:
            data = apply_bottom_center_pivot_glb(data)
        return data

    TEX_RES_MAP = {"512": 512, "1k": 1024, "2k": 2048, "4k": 4096}

    sub = db.query(GallerySubmission).filter(
        GallerySubmission.id == submission_id
    ).first()
    if not sub:
        raise HTTPException(404, "Model không tồn tại")

    if not sub.is_public:
        if not current_user or current_user.id != sub.user_id:
            raise HTTPException(403, "Không có quyền export model này")

    if not sub.model_url:
        raise HTTPException(404, "File model không tồn tại")

    model_rel  = sub.model_url
    src_ext    = Path(model_rel.split("?")[0]).suffix.lower()   # ".glb" | ".obj" | ".stl" | ""
    src_fmt    = src_ext.lstrip(".")                            # "glb"  | "obj"  | "stl"  | ""

    # model_url là full URL không có extension (job generate: /download/{id}/white|textured)
    # → tìm file thực trên DOWNLOAD_DIR theo job_id
    if not src_fmt:
        import re as _re
        _m = _re.search(r"/download/([^/]+)/", model_rel)
        if _m:
            _jid = _m.group(1)
            _DDIR = Path(settings.DOWNLOAD_DIR)
            _candidates = [
                (_DDIR / f"{_jid}.glb",       "glb"),
                (_DDIR / f"{_jid}.white.glb", "glb"),
                (_DDIR / f"{_jid}.stl",       "stl"),
                (_DDIR / f"{_jid}.obj",       "obj"),
            ]
            _found = next((_f for _f, _e in _candidates if _f.exists()), None)
            if _found is None:
                raise HTTPException(404, "File model không tồn tại trên server")
            model_full = _found
            src_fmt    = _found.suffix.lstrip(".")
        else:
            raise HTTPException(400, "Không xác định được định dạng file gốc")
    else:
        model_full = GALLERY_DIR / model_rel

    base_name  = sub.model_name or Path(model_rel).stem
    safe_name  = "".join(c if c.isalnum() or c in "-_" else "_" for c in base_name)

    # ── Cùng định dạng ────────────────────────────────────────────────────────
    if format == src_fmt:
        if not model_full.exists():
            raise HTTPException(404, "File không tồn tại trên server")

        needs_postprocess = (src_fmt == "glb" and (not include_skeleton or bottom_center_pivot)) or (src_fmt in ("obj", "stl") and bottom_center_pivot)

        # Có yêu cầu downscale texture
        if tex_res and src_fmt in ("glb", "obj"):
            max_dim = TEX_RES_MAP[tex_res]
            try:
                if src_fmt == "glb":
                    raw  = model_full.read_bytes()
                    data = _downscale_glb_textures(raw, max_dim)
                    data = _postprocess_glb(data)
                    return StreamingResponse(
                        io.BytesIO(data), media_type="model/gltf-binary",
                        headers={"Content-Disposition": f'attachment; filename="{safe_name}.glb"'},
                    )
                else:  # obj bundle
                    bundle_dir = model_full.parent
                    data = _downscale_obj_bundle_zip(bundle_dir, safe_name, max_dim)
                    return StreamingResponse(
                        io.BytesIO(data), media_type="application/zip",
                        headers={"Content-Disposition": f'attachment; filename="{safe_name}_obj.zip"'},
                    )
            except Exception as e:
                logger.error("Downscale failed: %s", e)
                raise HTTPException(500, f"Downscale thất bại: {e}")

        # Cần postprocess → không redirect được, phải đọc + xử lý + trả bytes
        if needs_postprocess:
            try:
                if src_fmt == "glb":
                    data = _postprocess_glb(model_full.read_bytes())
                    return StreamingResponse(
                        io.BytesIO(data), media_type="model/gltf-binary",
                        headers={"Content-Disposition": f'attachment; filename="{safe_name}.glb"'},
                    )
                elif src_fmt == "stl":
                    data = to_stl(model_full, bottom_center_pivot=bottom_center_pivot)
                    return StreamingResponse(
                        io.BytesIO(data), media_type="model/stl",
                        headers={"Content-Disposition": f'attachment; filename="{safe_name}.stl"'},
                    )
                elif src_fmt == "obj":
                    # OBJ pivot: convert → apply pivot → trả zip
                    import tempfile as _tf, os as _os
                    glb_data = obj_to_glb(model_full.parent, model_full.name)
                    glb_data = _postprocess_glb(glb_data)
                    with _tf.NamedTemporaryFile(suffix=".glb", delete=False) as tf:
                        tf.write(glb_data); tmp_glb = tf.name
                    try:
                        data = glb_to_obj_zip(Path(tmp_glb), base_name=safe_name)
                    finally:
                        _os.unlink(tmp_glb)
                    return StreamingResponse(
                        io.BytesIO(data), media_type="application/zip",
                        headers={"Content-Disposition": f'attachment; filename="{safe_name}_obj.zip"'},
                    )
            except Exception as e:
                logger.error("Postprocess same-format failed: %s", e)
                raise HTTPException(500, f"Xử lý thất bại: {e}")

        # Không downscale, không postprocess → redirect file gốc
        return RedirectResponse(
            url=f"{settings.EXTERNAL_URL}/gallery-files/{model_rel}"
        )

    # ── OBJ → GLB ────────────────────────────────────────────────────────────
    if src_fmt == "obj" and format == "glb":
        try:
            data = obj_to_glb(model_full.parent, model_full.name)
            data = _postprocess_glb(data)
        except Exception as e:
            logger.error("OBJ→GLB failed: %s", e)
            raise HTTPException(500, f"Chuyển đổi OBJ → GLB thất bại: {e}")
        return StreamingResponse(
            io.BytesIO(data), media_type="model/gltf-binary",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.glb"'},
        )

    # ── OBJ → STL ────────────────────────────────────────────────────────────
    if src_fmt == "obj" and format == "stl":
        try:
            data = to_stl(model_full, bottom_center_pivot=bottom_center_pivot)
        except Exception as e:
            logger.error("OBJ→STL failed: %s", e)
            raise HTTPException(500, f"Chuyển đổi OBJ → STL thất bại: {e}")
        return StreamingResponse(
            io.BytesIO(data), media_type="model/stl",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.stl"'},
        )

    # ── GLB → OBJ (zip) ──────────────────────────────────────────────────────
    if src_fmt == "glb" and format == "obj":
        try:
            # Áp dụng postprocess trước khi convert sang OBJ
            raw = _postprocess_glb(model_full.read_bytes())
            import tempfile, os as _os
            with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as tf:
                tf.write(raw); tmp_glb = tf.name
            try:
                data = glb_to_obj_zip(Path(tmp_glb), base_name=safe_name)
            finally:
                _os.unlink(tmp_glb)
        except Exception as e:
            logger.error("GLB→OBJ failed: %s", e)
            raise HTTPException(500, f"Chuyển đổi GLB → OBJ thất bại: {e}")
        return StreamingResponse(
            io.BytesIO(data), media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}_obj.zip"'},
        )

    # ── GLB → STL ────────────────────────────────────────────────────────────
    if src_fmt == "glb" and format == "stl":
        try:
            data = to_stl(model_full, bottom_center_pivot=bottom_center_pivot)
        except Exception as e:
            logger.error("GLB→STL failed: %s", e)
            raise HTTPException(500, f"Chuyển đổi GLB → STL thất bại: {e}")
        return StreamingResponse(
            io.BytesIO(data), media_type="model/stl",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.stl"'},
        )

    # ── STL → GLB ────────────────────────────────────────────────────────────
    if src_fmt == "stl" and format == "glb":
        try:
            import trimesh as _trimesh
            scene = _trimesh.load(str(model_full), force="scene", process=False)
            data = scene.export(file_type="glb")
            data = _postprocess_glb(data)
        except Exception as e:
            logger.error("STL→GLB failed: %s", e)
            raise HTTPException(500, f"Chuyển đổi STL → GLB thất bại: {e}")
        return StreamingResponse(
            io.BytesIO(data), media_type="model/gltf-binary",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.glb"'},
        )

    # ── STL → OBJ ────────────────────────────────────────────────────────────
    if src_fmt == "stl" and format == "obj":
        try:
            data = stl_to_obj(model_full, base_name=safe_name, bottom_center_pivot=bottom_center_pivot)
        except Exception as e:
            logger.error("STL→OBJ failed: %s", e)
            raise HTTPException(500, f"Chuyển đổi STL → OBJ thất bại: {e}")
        return StreamingResponse(
            io.BytesIO(data), media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.obj"'},
        )

    raise HTTPException(400, f"Không hỗ trợ convert từ {src_fmt} sang {format}")


# ============================================
# User endpoints
# ============================================

@router.post("/submit", status_code=201)
async def submit_model(
    model_name: str = Form(...),
    tags: str = Form(""),
    categories: str = Form("[]"),   # JSON array string: '["Character","Animal"]'
    image: Optional[UploadFile] = File(None),  # Optional — backend tự render thumbnail
    model: UploadFile = File(...),
    mtl: Optional[UploadFile] = File(None),  # File .mtl (optional)
    textures: List[UploadFile] = File([]),   # Texture files (optional, multiple)
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    User upload model lên gallery, chờ admin duyệt.
    - image: ảnh preview (optional — backend tự render từ 3D model)
    - model: file 3D (glb/obj/stl)
    - mtl: file material cho .obj (optional)
    - textures: texture images cho .mtl (optional, multiple files)
    - categories: JSON array, e.g. '["Character","Animal"]'
    """
    # Validate file types
    allowed_images = {".jpg", ".jpeg", ".png", ".webp"}
    allowed_models = {".glb", ".obj", ".stl"}
    allowed_textures = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tga"}

    mdl_ext = Path(model.filename).suffix.lower()

    # Validate ảnh (nếu user upload)
    if image and image.filename:
        img_ext = Path(image.filename).suffix.lower()
        if img_ext not in allowed_images:
            raise HTTPException(400, "Ảnh phải là jpg/png/webp")
    if mdl_ext not in allowed_models:
        raise HTTPException(400, "Model phải là glb/obj/stl")

    # Parse categories
    try:
        cats: List[str] = json.loads(categories)
    except Exception:
        cats = []

    # Lưu ảnh user upload → image_url (dùng làm input reference trong ModelModal)
    image_path = _save_file(image, "images") if (image and image.filename) else None

    # Lưu file 3D
    if mdl_ext == ".obj":
        model_path = _save_obj_bundle(model, mtl, textures)
    else:
        model_path = _save_file(model, "models")

    # ── Auto-render thumbnail từ 3D model → thumbnail_url (dùng cho gallery card) ──
    try:
        thumb_path = _auto_thumbnail(model_path)
        if thumb_path:
            logger.info(f"[submit] Auto-thumbnail: {thumb_path}")
        else:
            logger.warning("[submit] Renderer không khả dụng, thumbnail_url = None")
    except Exception as e:
        logger.error(f"[submit] Auto-thumbnail crash: {e}", exc_info=True)
        thumb_path = None

    # Tạo submission
    submission = GallerySubmission(
        user_id=current_user.id,
        model_name=model_name.strip(),
        tags=tags.strip() or None,
        image_url=image_path,        # ảnh user upload
        thumbnail_url=thumb_path,    # ảnh render từ 3D
        model_url=model_path,
        is_public=False,
    )
    db.add(submission)
    db.flush()  # Lấy id trước khi add categories

    for cat in cats:
        if cat.strip():
            db.add(SubmissionCategory(submission_id=submission.id, category=cat.strip()))

    db.commit()
    db.refresh(submission)

    return {
        "status": "pending",
        "message": "Model đã được gửi, đang chờ admin duyệt",
        "submission_id": submission.id,
    }


# ============================================
# Admin endpoints
# ============================================

@router.get("/admin/pending")
async def get_pending_submissions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin: danh sách submission chờ duyệt."""
    query = db.query(GallerySubmission).filter(
        GallerySubmission.is_public == False,
        GallerySubmission.source.notin_(["convert3d", "collect", "upload"]),
    )
    total = query.count()
    submissions = (
        query
        .order_by(GallerySubmission.created_at.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return {
        "submissions": [_to_submission_out(s) for s in submissions],
        "total": total,
    }


@router.patch("/admin/{submission_id}/approve")
async def approve_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin: duyệt submission → hiện lên gallery."""
    sub = db.query(GallerySubmission).filter(GallerySubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(404, "Không tìm thấy submission")

    if sub.source == "convert3d":
        raise HTTPException(403, "Model này được tạo từ Convert3D và không thể publish lên gallery")

    # ── Render thumbnail nếu chưa có (model submit trước khi có renderer) ──
    if sub.model_url and not sub.thumbnail_url:
        try:
            thumb_path = _auto_thumbnail(sub.model_url)
            if thumb_path:
                sub.thumbnail_url = thumb_path
                logger.info(f"[approve] Auto-thumbnail: {thumb_path}")
        except Exception as e:
            logger.warning(f"[approve] Render thumbnail thất bại: {e}")

    sub.is_public = True
    db.commit()
    return {"status": "approved", "submission_id": submission_id}


@router.patch("/admin/{submission_id}/reject")
async def reject_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin: từ chối và xóa submission."""
    sub = db.query(GallerySubmission).filter(GallerySubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(404, "Không tìm thấy submission")

    # Xóa file
    for path in [sub.image_url, sub.model_url]:
        if path:
            f = GALLERY_DIR / path
            if f.exists():
                f.unlink()

    db.delete(sub)
    db.commit()
    return {"status": "rejected", "submission_id": submission_id}


@router.delete("/admin/{submission_id}")
async def delete_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin: xóa submission bất kỳ (kể cả đã public)."""
    sub = db.query(GallerySubmission).filter(GallerySubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(404, "Không tìm thấy submission")

    # Xóa file vật lý
    import shutil as _shutil
    for path in [sub.image_url, sub.model_url, sub.thumbnail_url]:
        if not path:
            continue
        full_path = GALLERY_DIR / path
        bundle_dir = full_path.parent
        # OBJ bundle nằm trong models/{uuid_folder}/ → xóa cả thư mục con
        is_obj_bundle = (
            bundle_dir.parent == GALLERY_DIR / "models"
            and bundle_dir != GALLERY_DIR / "models"
        )
        if is_obj_bundle and bundle_dir.exists():
            _shutil.rmtree(bundle_dir, ignore_errors=True)
        elif full_path.exists():
            full_path.unlink(missing_ok=True)

    db.delete(sub)
    db.commit()
    return {"status": "deleted", "submission_id": submission_id}


@router.get("/admin/all")
async def get_all_submissions(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin: toàn bộ submissions (cả pending lẫn public)."""
    query = db.query(GallerySubmission).filter(
        GallerySubmission.source.notin_(["convert3d", "collect", "upload"]),
    ).order_by(GallerySubmission.created_at.desc())
    total = query.count()
    submissions = query.limit(limit).offset(offset).all()
    return {
        "submissions": [_to_submission_out(s) for s in submissions],
        "total": total,
    }
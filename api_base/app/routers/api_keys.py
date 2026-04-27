"""
API Key router — Admin quản lý key cấp cho bên thứ ba.

Endpoints:
  POST   /api/v1/admin/api-keys                    — Tạo key mới (admin only)
  GET    /api/v1/admin/api-keys                    — Liệt kê tất cả key (admin only)
  PATCH  /api/v1/admin/api-keys/{key_id}           — Cập nhật name/quota/expires/note (admin only)
  PATCH  /api/v1/admin/api-keys/{key_id}/revoke    — Thu hồi key, giữ lại trong DB (admin only)
  DELETE /api/v1/admin/api-keys/{key_id}           — Xóa vĩnh viễn (admin only)
  GET    /api/v1/admin/api-keys/me                 — Xem key của chính mình (user)
"""

import hashlib
import secrets
import string
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.models.api_key import ApiKey
from app.models.base_db import get_db
from app.security.security import get_current_admin, get_current_user
from app.models.user import User

router = APIRouter(prefix="/api-keys", tags=["API Keys"])


# =========================================
# HELPERS
# =========================================

def _generate_raw_key() -> str:
    """Tạo raw key dạng: sk_live_<40 ký tự ngẫu nhiên>"""
    alphabet = string.ascii_letters + string.digits
    rand_part = "".join(secrets.choice(alphabet) for _ in range(40))
    return f"sk_live_{rand_part}"


def _hash_key(raw_key: str) -> str:
    """SHA-256 hash của raw key."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


def _preview(raw_key: str) -> str:
    """Trả về 12 ký tự đầu + '...' + 4 ký tự cuối."""
    return f"{raw_key[:12]}...{raw_key[-4:]}"


# =========================================
# SCHEMAS
# =========================================

class CreateApiKeyRequest(BaseModel):
    name: str
    owner_email: Optional[EmailStr] = None
    owner_user_id: Optional[int] = None
    quota_per_month: Optional[int] = None
    expires_at: Optional[date] = None
    note: Optional[str] = None


class UpdateApiKeyRequest(BaseModel):
    """Chỉ cho phép cập nhật các trường metadata — không đổi được key_hash."""
    name: Optional[str] = None
    quota_per_month: Optional[int] = None
    expires_at: Optional[date] = None
    note: Optional[str] = None


class ApiKeyResponse(BaseModel):
    id: int
    name: str
    key_preview: str
    owner_email: Optional[str]
    owner_user_id: Optional[int]
    quota_per_month: Optional[int]
    calls_used: int
    calls_this_month: int
    status: str
    expires_at: Optional[date]
    note: Optional[str]
    created_at: datetime
    last_used_at: Optional[datetime]

    class Config:
        from_attributes = True


class CreateApiKeyResponse(ApiKeyResponse):
    """Chỉ trả key plaintext 1 lần duy nhất khi tạo."""
    key_value: str


# =========================================
# ADMIN ENDPOINTS
# =========================================

@router.post("", response_model=CreateApiKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    request: CreateApiKeyRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    ## Tạo API Key mới (Admin only)

    Raw key chỉ trả về **1 lần duy nhất** trong response này.
    Hệ thống chỉ lưu SHA-256 hash — không thể phục hồi plaintext sau đó.

    Caller dùng key qua header: `X-API-Key: sk_live_xxxx...`
    """
    raw_key = _generate_raw_key()
    key_hash = _hash_key(raw_key)
    preview = _preview(raw_key)

    api_key = ApiKey(
        name=request.name,
        key_hash=key_hash,
        key_preview=preview,
        owner_email=request.owner_email,
        owner_user_id=request.owner_user_id,
        quota_per_month=request.quota_per_month,
        expires_at=request.expires_at,
        note=request.note,
        status="active",
    )

    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return CreateApiKeyResponse(
        **ApiKeyResponse.model_validate(api_key).model_dump(),
        key_value=raw_key,
    )


@router.get("", response_model=List[ApiKeyResponse])
async def list_api_keys(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Liệt kê tất cả API key (Admin only)."""
    keys = db.query(ApiKey).order_by(ApiKey.created_at.desc()).all()
    return [ApiKeyResponse.model_validate(k) for k in keys]


@router.patch("/{key_id}", response_model=ApiKeyResponse)
async def update_api_key(
    key_id: int,
    request: UpdateApiKeyRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    ## Cập nhật API Key (Admin only)

    Cho phép sửa name, quota_per_month, expires_at, note.
    Truyền null để xóa giới hạn (quota/expires).
    Không thể thay đổi key_hash hay owner sau khi tạo.
    """
    api_key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key không tồn tại")

    fields_set = request.model_fields_set

    if "name" in fields_set and request.name is not None:
        api_key.name = request.name.strip()
    if "quota_per_month" in fields_set:
        api_key.quota_per_month = request.quota_per_month  # None = xóa giới hạn
    if "expires_at" in fields_set:
        api_key.expires_at = request.expires_at            # None = vĩnh viễn
    if "note" in fields_set:
        api_key.note = (request.note.strip() or None) if request.note else None

    db.commit()
    db.refresh(api_key)

    return ApiKeyResponse.model_validate(api_key)


@router.patch("/{key_id}/revoke", status_code=status.HTTP_200_OK)
async def revoke_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    ## Thu hồi API Key (Admin only)

    Key bị set `status = revoked` — mọi request sau đó bị từ chối 401.
    Record vẫn được giữ lại trong DB để audit.
    """
    api_key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key không tồn tại")

    if api_key.status == "revoked":
        raise HTTPException(status_code=400, detail="API key đã bị thu hồi trước đó")

    api_key.status = "revoked"
    db.commit()

    return {"message": f"API key '{api_key.name}' đã bị thu hồi", "id": key_id}


@router.delete("/{key_id}", status_code=status.HTTP_200_OK)
async def delete_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    ## Xóa vĩnh viễn API Key (Admin only)

    Xóa hoàn toàn record khỏi DB — không thể khôi phục.
    Dùng khi muốn dọn dẹp key cũ, không chỉ disable.
    """
    api_key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key không tồn tại")

    db.delete(api_key)
    db.commit()

    return {"message": f"API key '{api_key.name}' đã bị xóa vĩnh viễn", "id": key_id}


# =========================================
# USER ENDPOINT — xem key của mình
# =========================================

@router.get("/me", response_model=List[ApiKeyResponse])
async def my_api_keys(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Xem danh sách API key gắn với tài khoản của mình."""
    keys = (
        db.query(ApiKey)
        .filter(ApiKey.owner_user_id == current_user.id)
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return [ApiKeyResponse.model_validate(k) for k in keys]
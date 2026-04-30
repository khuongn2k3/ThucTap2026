"""
Admin router — Quản lý hệ thống (admin only).

Endpoints:
  GET   /api/v1/admin/stats                  — Thống kê tổng quan
  GET   /api/v1/admin/users                  — Danh sách người dùng
  PATCH /api/v1/admin/users/{id}/role        — Đổi role user
  PATCH /api/v1/admin/users/{id}/ban         — Khóa / mở khóa tài khoản
  PATCH /api/v1/admin/users/{id}/tokens      — Cộng / trừ tokens
  GET   /api/v1/admin/jobs                   — Danh sách jobs toàn hệ thống
"""

from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.base_db import get_db
from app.models.task import ModelJob
from app.models.user import User
from app.security.security import get_current_admin

router = APIRouter(tags=["Admin"])


# =========================================
# SCHEMAS
# =========================================

class AdminUserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    avatar_url: Optional[str] = None
    tokens: int = 0
    is_banned: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class UpdateRoleRequest(BaseModel):
    role: Literal["user", "admin"]


class UpdateBanRequest(BaseModel):
    banned: bool


class UpdateTokensRequest(BaseModel):
    delta: int  # Dương = cộng, âm = trừ


class AdminJobResponse(BaseModel):
    id: int
    job_id: str
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    status: str
    model_name: Optional[str] = None
    input_image_url: Optional[str] = None
    output_model_url: Optional[str] = None
    tokens_used: int = 1
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =========================================
# GET /stats
# =========================================

@router.get("/stats")
async def get_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    Thống kê tổng quan hệ thống.

    Trả về số lượng: users, jobs, đang processing, đã failed.
    """
    total_users = db.query(User).count()
    total_jobs = db.query(ModelJob).count()
    processing = db.query(ModelJob).filter(ModelJob.status == "processing").count()
    failed = db.query(ModelJob).filter(ModelJob.status == "failed").count()

    return {
        "users": total_users,
        "jobs": total_jobs,
        "processing": processing,
        "failed": failed,
    }


# =========================================
# GET /users
# =========================================

@router.get("/users")
async def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Danh sách toàn bộ người dùng (Admin only)."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return {
        "users": [
            AdminUserResponse(
                id=u.id,
                name=u.name,
                email=u.email,
                role=u.role,
                avatar_url=u.avatar_url,
                tokens=u.tokens,
                is_banned=getattr(u, "is_banned", False) or False,
                created_at=u.created_at,
            )
            for u in users
        ]
    }


# =========================================
# PATCH /users/{user_id}/role
# =========================================

@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    request: UpdateRoleRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Đổi role của người dùng giữa 'user' và 'admin'."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại")

    if user.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="Không thể tự thay đổi role của chính mình",
        )

    user.role = request.role
    db.commit()
    db.refresh(user)

    return {
        "message": f"Đã cập nhật role của {user.name} thành '{request.role}'",
        "user_id": user_id,
        "role": user.role,
    }


# =========================================
# PATCH /users/{user_id}/ban
# =========================================

@router.patch("/users/{user_id}/ban")
async def update_user_ban(
    user_id: int,
    request: UpdateBanRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Khóa hoặc mở khóa tài khoản người dùng."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại")

    if user.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="Không thể tự khóa tài khoản của chính mình",
        )

    # Gán is_banned — dùng setattr để tương thích nếu cột chưa được migrate
    if not hasattr(user, "is_banned"):
        raise HTTPException(
            status_code=500,
            detail="Cột is_banned chưa được thêm vào DB. Chạy migration trước.",
        )

    user.is_banned = request.banned
    db.commit()

    action = "khóa" if request.banned else "mở khóa"
    return {
        "message": f"Đã {action} tài khoản {user.name}",
        "user_id": user_id,
        "is_banned": request.banned,
    }


# =========================================
# PATCH /users/{user_id}/tokens
# =========================================

@router.patch("/users/{user_id}/tokens")
async def update_user_tokens(
    user_id: int,
    request: UpdateTokensRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    Cộng hoặc trừ tokens của người dùng.

    - **delta**: Số tokens cần thay đổi. Dương = cộng, âm = trừ.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại")

    new_tokens = user.tokens + request.delta
    if new_tokens < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Không đủ tokens. Hiện tại: {user.tokens}, trừ: {abs(request.delta)}",
        )

    user.tokens = new_tokens
    db.commit()
    db.refresh(user)

    action = f"+{request.delta}" if request.delta >= 0 else str(request.delta)
    return {
        "message": f"Đã cập nhật tokens của {user.name} ({action})",
        "user_id": user_id,
        "tokens": user.tokens,
        "delta": request.delta,
    }


# =========================================
# GET /jobs
# =========================================

# =========================================
# DELETE /users/{user_id}
# =========================================

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Xóa người dùng và toàn bộ job của họ (Admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Người dùng không tồn tại")

    if user.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="Không thể tự xóa tài khoản của chính mình",
        )

    # Xóa hết job của user trước
    db.query(ModelJob).filter(ModelJob.user_id == user_id).delete()

    # Rồi mới xóa user
    db.delete(user)
    db.commit()

    return {
        "message": f"Đã xóa tài khoản {user.name} và toàn bộ job liên quan",
        "user_id": user_id,
    }


# =========================================
# GET /jobs
# =========================================

@router.get("/jobs")
async def list_jobs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, description="pending | processing | completed | failed"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    Danh sách toàn bộ jobs 3D trong hệ thống (Admin only).

    Hỗ trợ phân trang và lọc theo trạng thái.
    """
    query = db.query(ModelJob)

    if status and status != "all":
        valid_statuses = {"pending", "processing", "completed", "failed"}
        if status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Status không hợp lệ. Chọn một trong: {', '.join(valid_statuses)}",
            )
        query = query.filter(ModelJob.status == status)

    total = query.count()
    jobs = query.order_by(ModelJob.created_at.desc()).offset(offset).limit(limit).all()

    # Lấy user names theo batch để tránh N+1 query
    user_ids = list({j.user_id for j in jobs if j.user_id is not None})
    users_map: dict[int, str] = {}
    if user_ids:
        users = db.query(User.id, User.name).filter(User.id.in_(user_ids)).all()
        users_map = {u.id: u.name for u in users}

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "jobs": [
            {
                "id": j.id,
                "job_id": j.job_id,
                "user_id": j.user_id,
                "user_name": users_map.get(j.user_id),
                "status": j.status,
                "model_name": j.model_name,
                "input_image_url": j.input_image_url,
                "output_model_url": j.output_model_url,
                "tokens_used": j.tokens_used,
                "error_message": j.error_message,
                "created_at": j.created_at,
                "completed_at": j.completed_at,
            }
            for j in jobs
        ],
    }
"""
Admin router — System management (admin only).

Endpoints:
  GET   /api/v1/admin/stats                  — System overview stats
  GET   /api/v1/admin/users                  — List all users
  PATCH /api/v1/admin/users/{id}/role        — Change user role
  PATCH /api/v1/admin/users/{id}/ban         — Ban / unban account
  PATCH /api/v1/admin/users/{id}/tokens      — Add / subtract tokens
  GET   /api/v1/admin/jobs                   — List all jobs
"""

from datetime import datetime
from pathlib import Path
from typing import List, Literal, Optional
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.base_db import get_db
from app.models.task import ModelJob
from app.models.user import User
from app.security.security import get_current_admin
from app.services.hunyuan3d_mv_service import hunyuan3d_mv_service

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
    delta: int  # Positive = add, negative = subtract


class PricingConfig(BaseModel):
    stage1_tokens: int = 25
    stage2_tokens: int = 25
    signup_bonus: int = 100
    daily_bonus: int = 0


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
    """System overview stats — total users, jobs, processing, failed."""
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
    """List all users (admin only)."""
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
    """Change a user's role between 'user' and 'admin'."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="Cannot change your own role",
        )

    user.role = request.role
    db.commit()
    db.refresh(user)

    return {
        "message": f"Updated role of {user.name} to '{request.role}'",
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
    """Ban or unban a user account."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="Cannot ban your own account",
        )

    if not hasattr(user, "is_banned"):
        raise HTTPException(
            status_code=500,
            detail="Column 'is_banned' not found in DB. Run migration first.",
        )

    user.is_banned = request.banned
    db.commit()

    action = "banned" if request.banned else "unbanned"
    return {
        "message": f"Account {user.name} has been {action}",
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
    Add or subtract tokens from a user.

    - **delta**: Amount to change. Positive = add, negative = subtract.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_tokens = user.tokens + request.delta
    if new_tokens < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient tokens. Current: {user.tokens}, subtract: {abs(request.delta)}",
        )

    user.tokens = new_tokens
    db.commit()
    db.refresh(user)

    action = f"+{request.delta}" if request.delta >= 0 else str(request.delta)
    return {
        "message": f"Updated tokens for {user.name} ({action})",
        "user_id": user_id,
        "tokens": user.tokens,
        "delta": request.delta,
    }


# =========================================
# GET /pricing  &  POST /pricing
# =========================================

PRICING_FILE = Path(__file__).resolve().parent.parent / "pricing.json"

DEFAULT_PRICING = {
    "stage1_tokens": 25,
    "stage2_tokens": 25,
    "signup_bonus":  100,
    "daily_bonus":   0,
}

def _load_pricing() -> dict:
    try:
        if PRICING_FILE.exists():
            return {**DEFAULT_PRICING, **json.loads(PRICING_FILE.read_text())}
    except Exception:
        pass
    return DEFAULT_PRICING.copy()

def _save_pricing(data: dict):
    PRICING_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))


@router.get("/pricing")
async def get_pricing(admin: User = Depends(get_current_admin)):
    """Get current token pricing config."""
    return _load_pricing()


@router.post("/pricing")
async def update_pricing(
    body: PricingConfig,
    admin: User = Depends(get_current_admin),
):
    """Update token pricing for Stage 1, Stage 2, signup bonus, and daily bonus."""
    data = body.model_dump()
    _save_pricing(data)
    return {"message": "Token pricing config saved", **data}


# =========================================
# DELETE /users/{user_id}
# =========================================

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Delete a user and all their jobs (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your own account",
        )

    db.query(ModelJob).filter(ModelJob.user_id == user_id).delete()
    db.delete(user)
    db.commit()

    return {
        "message": f"Deleted account {user.name} and all related jobs",
        "user_id": user_id,
    }


# =========================================
# GET /jobs
# =========================================

@router.get("/jobs")
async def list_jobs(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, description="pending | processing | completed | failed | cancelled"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    List all 3D jobs in the system (admin only).

    Supports pagination and filtering by status.
    """
    query = db.query(ModelJob)

    if status and status != "all":
        valid_statuses = {"pending", "processing", "completed", "failed", "cancelled"}
        if status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Choose one of: {', '.join(valid_statuses)}",
            )
        query = query.filter(ModelJob.status == status)

    total = query.count()
    jobs = query.order_by(ModelJob.created_at.desc()).offset(offset).limit(limit).all()

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


# =========================================
# POST /jobs/{job_id}/cancel
# =========================================

CANCELLABLE_STATUSES = {"pending", "processing"}


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    Cancel a pending or running job (admin only).

    - Only jobs with status **pending** or **processing** can be cancelled.
    - Already completed, failed, or cancelled jobs will be rejected.
    - Tokens are refunded to the user if applicable.
    """
    job = db.query(ModelJob).filter(ModelJob.job_id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status not in CANCELLABLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel job with status '{job.status}'. Only pending or processing jobs can be cancelled.",
        )

    refunded_tokens = 0
    if job.user_id and job.tokens_used and job.tokens_used > 0:
        user = db.query(User).filter(User.id == job.user_id).first()
        if user:
            user.tokens = user.tokens + job.tokens_used
            refunded_tokens = job.tokens_used

    job.status = "cancelled"
    job.completed_at = datetime.utcnow()
    job.error_message = "Cancelled by admin"

    db.commit()

    await hunyuan3d_mv_service.request_cancel(job_id)

    return {
        "message": f"Job {job_id} has been cancelled",
        "job_id": job_id,
        "status": "cancelled",
        "refunded_tokens": refunded_tokens,
    }
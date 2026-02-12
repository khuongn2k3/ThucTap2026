"""
Authentication router (stub).
"""

from fastapi import APIRouter

router = APIRouter(prefix="/auth")

@router.get("/")
async def auth_placeholder():
    """Placeholder endpoint."""
    return {"message": "Auth endpoints coming soon"}
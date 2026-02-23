"""
Authentication router: Register, Login, Get Current User.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

from app.models.base_db import get_db
from app.models.user import User
from app.security.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# =========================================
# PYDANTIC SCHEMAS
# =========================================

class RegisterRequest(BaseModel):
    """Register request schema."""
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    """Login request schema."""
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    """User response schema."""
    id: int
    name: str
    email: str
    role: str
    avatar_url: Optional[str] = None
    tokens: int = 0
    created_at: datetime
    
    class Config:
        from_attributes = True

class LoginResponse(BaseModel):
    """Login response schema."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# =========================================
# ENDPOINTS
# =========================================

@router.post("/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user.
    
    - **name**: User's full name
    - **email**: User's email (must be unique)
    - **password**: User's password (will be hashed)
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_pw = hash_password(request.password)
    new_user = User(
        name=request.name,
        email=request.email,
        password=hashed_pw,
        role="user",
        tokens=100  # Welcome bonus for new users
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create access token
    access_token = create_access_token(data={"sub": new_user.email})
    
    return LoginResponse(
        access_token=access_token,
        user=UserResponse.from_orm(new_user)
    )


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Login with email and password.
    
    - **email**: User's email
    - **password**: User's password
    
    Returns JWT access token and user info.
    """
    # Find user by email
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Verify password
    if not user.password or not verify_password(request.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Create access token
    access_token = create_access_token(data={"sub": user.email})
    
    return LoginResponse(
        access_token=access_token,
        user=UserResponse.from_orm(user)
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    Get current authenticated user.
    
    Requires JWT token in Authorization header: `Bearer <token>`
    """
    return UserResponse.from_orm(current_user)


@router.get("/")
async def auth_info():
    """Auth endpoints info."""
    return {
        "message": "Authentication endpoints",
        "endpoints": {
            "register": "POST /api/v1/auth/register",
            "login": "POST /api/v1/auth/login",
            "me": "GET /api/v1/auth/me (requires JWT)"
        }
    }
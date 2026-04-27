"""
Security utilities: JWT, Password hashing, API Key authentication.
"""

import hashlib
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.models.base_db import get_db
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


# =========================================
# AUTH CONTEXT — thay thế việc trả về User
# =========================================

@dataclass
class AuthContext:
    """
    Kết quả xác thực — dùng cho cả JWT lẫn API Key.

    type = "jwt"     → user_id có, api_key_id = None  → trừ user.tokens
    type = "api_key" → api_key_id có, user_id = None  → trừ api_key quota
    """
    type: Literal["jwt", "api_key"]
    user_id: Optional[int]        # có khi type=jwt
    api_key_id: Optional[int]     # có khi type=api_key
    user: Optional[User]          # object User nếu cần dùng thêm


# =========================================
# PASSWORD
# =========================================

def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > 72:
        password = password[:72]
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# =========================================
# JWT
# =========================================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return {"email": email}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


# =========================================
# API KEY
# =========================================

def _hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def _verify_api_key(raw_key: str, db: Session) -> "AuthContext":
    from app.models.api_key import ApiKey

    key_hash = _hash_api_key(raw_key)
    api_key = db.query(ApiKey).filter(ApiKey.key_hash == key_hash).first()

    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key không hợp lệ")

    if api_key.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"API key đã bị {api_key.status}")

    if api_key.expires_at and api_key.expires_at < date.today():
        api_key.status = "expired"
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key đã hết hạn")

    # Reset quota đầu tháng mới
    today = date.today()
    if api_key.reset_at is None or (api_key.reset_at.month, api_key.reset_at.year) != (today.month, today.year):
        api_key.calls_this_month = 0
        api_key.reset_at = today

    # Kiểm tra quota
    if api_key.quota_per_month is not None:
        if api_key.calls_this_month >= api_key.quota_per_month:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"API key đã đạt quota tháng này ({api_key.quota_per_month} lượt)",
            )

    # Cập nhật usage
    api_key.calls_used += 1
    api_key.calls_this_month += 1
    api_key.last_used_at = datetime.utcnow()
    db.commit()

    return AuthContext(
        type="api_key",
        user_id=api_key.owner_user_id,  # có thể None nếu key không gắn user
        api_key_id=api_key.id,
        user=None,
    )


# =========================================
# DEPENDENCIES (dùng trong router)
# =========================================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Dùng cho các endpoint chỉ cho phép JWT (auth, payment, profile...)."""
    token = credentials.credentials
    token_data = decode_token(token)
    user = db.query(User).filter(User.email == token_data["email"]).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if getattr(user, "is_banned", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản của bạn đã bị khóa. Vui lòng liên hệ admin.")
    return user


async def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    return current_user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if credentials is None:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


async def get_auth_context(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db),
) -> AuthContext:
    """
    Dependency dùng cho endpoint 3D generate.
    Chấp nhận 2 cách xác thực:

      JWT:     Authorization: Bearer <token>
      API Key: X-API-Key: sk_live_xxxx

    Trả về AuthContext thay vì User — để router biết
    cần trừ token từ đâu (user.tokens hay api_key quota).
    """
    raw_key = request.headers.get("X-API-Key")
    if raw_key:
        return _verify_api_key(raw_key, db)

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cần Authorization: Bearer <token> hoặc X-API-Key: <key>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data = decode_token(credentials.credentials)
    user = db.query(User).filter(User.email == token_data["email"]).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if getattr(user, "is_banned", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tài khoản của bạn đã bị khóa. Vui lòng liên hệ admin.")

    return AuthContext(type="jwt", user_id=user.id, api_key_id=None, user=user)
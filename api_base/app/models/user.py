"""
User database model.
"""

from sqlalchemy import Boolean, Column, Integer, String, Enum, TIMESTAMP
from sqlalchemy.sql import func
from app.models.base_db import Base

class User(Base):
    """User model."""
    
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=True)  # NULL for Google OAuth
    role = Column(Enum('user', 'admin'), nullable=False, default='user')
    google_id = Column(String(255), unique=True, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    tokens = Column(Integer, default=0, nullable=False)
    is_banned = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
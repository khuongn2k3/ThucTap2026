"""
API Key database model.
"""

from sqlalchemy import Column, Integer, String, Enum, TIMESTAMP, ForeignKey, Text, Date, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.models.base_db import Base


class ApiKey(Base):
    """API Key model — cho phép bên thứ ba gọi API tạo model 3D."""

    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    name = Column(String(255), nullable=False, comment="Tên hiển thị để nhận biết key")

    # Chỉ lưu SHA-256 hash, không bao giờ lưu plaintext
    key_hash = Column(String(64), unique=True, nullable=False, index=True, comment="SHA-256 hash of raw key")

    # 12 ký tự đầu + 4 ký tự cuối để hiển thị (vd: sk_live_xxxx...abcd)
    key_preview = Column(String(20), nullable=False, comment="Preview for display")

    owner_email = Column(String(255), nullable=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    quota_per_month = Column(Integer, nullable=True, comment="NULL = không giới hạn")
    calls_used = Column(Integer, nullable=False, default=0)
    calls_this_month = Column(Integer, nullable=False, default=0)
    reset_at = Column(Date, nullable=True, comment="Ngày reset calls_this_month gần nhất")

    status = Column(
        Enum("active", "revoked", "expired"),
        nullable=False,
        default="active",
        index=True,
    )

    expires_at = Column(Date, nullable=True, comment="NULL = không hết hạn")
    note = Column(Text, nullable=True)

    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
    last_used_at = Column(DateTime, nullable=True)

    # Relationship
    owner = relationship("User", backref="api_keys")

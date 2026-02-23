"""
Payment model for automatic recharge system.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Enum, Index
from datetime import datetime
import enum

from app.models.base_db import Base


class PaymentStatus(str, enum.Enum):
    """Payment status enum for validation."""
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


class Payment(Base):
    """Payment transaction record."""
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, nullable=False, index=True)
    
    # Package info
    package_id = Column(String(50), nullable=False)
    amount_vnd = Column(Float, nullable=False)
    tokens = Column(Integer, nullable=False)
    
    # Payment tracking
    hex_id = Column(String(20), unique=True, index=True, nullable=True)
    status = Column(
        Enum('pending', 'completed', 'failed', 'expired', name='payment_status'),
        default='pending',
        nullable=False,
        index=True
    )
    
    # Transaction info
    sepay_transaction_id = Column(String(100), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Indexes
    __table_args__ = (
        Index('idx_user_id', 'user_id'),
        Index('idx_hex_id', 'hex_id'),
        Index('idx_status', 'status'),
    )
"""
3D Model Job (Task) database model.
"""

from sqlalchemy import Column, Integer, String, Enum, TIMESTAMP, ForeignKey, Text, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.models.base_db import Base

class ModelJob(Base):
    """3D Model conversion job (task)."""
    
    __tablename__ = "model_jobs"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    job_id = Column(String(100), unique=True, nullable=False, index=True)
    status = Column(
        Enum('pending', 'processing', 'completed', 'failed'),
        nullable=False,
        default='pending',
        index=True
    )
    input_image_url = Column(String(500), nullable=False)
    output_model_url = Column(String(500), nullable=True)
    tokens_used = Column(Integer, nullable=False, default=1)
    error_message = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(
        TIMESTAMP, 
        server_default=func.now(), 
        onupdate=func.now(),
        index=True  
    )
    
    # Relationship
    user = relationship("User", backref="jobs")
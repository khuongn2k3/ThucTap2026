"""
Gallery Submission database models.
"""

import uuid as _uuid
from sqlalchemy import Column, Integer, String, Boolean, Text, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.models.base_db import Base


class GallerySubmission(Base):
    __tablename__ = "gallery_submissions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    uuid = Column(String(36), nullable=False, unique=True, default=lambda: str(_uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    model_name = Column(String(255), nullable=False)
    tags = Column(String(500), nullable=True)
    image_url = Column(String(500), nullable=True)       # ảnh user upload (input reference)
    thumbnail_url = Column(String(500), nullable=True)   # ảnh render từ 3D model (gallery card)
    model_url = Column(String(500), nullable=False)
    faces = Column(Integer, nullable=True)
    vertices = Column(Integer, nullable=True)
    is_public = Column(Boolean, nullable=False, default=False)
    source = Column(String(50), nullable=True, default="manual")
    # "convert3d" = auto-created từ AI generate hoặc manual upload trong Convert3D
    # "manual"    = user tự submit qua FeatureModal (Home page)
    likes_count = Column(Integer, nullable=False, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    user = relationship("User", backref="gallery_submissions")
    categories = relationship(
        "SubmissionCategory",
        backref="submission",
        cascade="all, delete-orphan"
    )
    likes = relationship(
        "GalleryLike",
        backref="submission",
        cascade="all, delete-orphan"
    )
    collections = relationship(
        "GalleryCollection",
        backref="submission",
        cascade="all, delete-orphan"
    )


class SubmissionCategory(Base):
    __tablename__ = "submission_categories"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    submission_id = Column(
        Integer,
        ForeignKey("gallery_submissions.id", ondelete="CASCADE"),
        nullable=False
    )
    category = Column(String(50), nullable=False)


class GalleryLike(Base):
    __tablename__ = "gallery_likes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    submission_id = Column(
        Integer,
        ForeignKey("gallery_submissions.id", ondelete="CASCADE"),
        nullable=False
    )
    created_at = Column(TIMESTAMP, server_default=func.now())

    user = relationship("User", backref="gallery_likes")


class GalleryCollection(Base):
    __tablename__ = "gallery_collections"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    submission_id = Column(
        Integer,
        ForeignKey("gallery_submissions.id", ondelete="CASCADE"),
        nullable=False
    )
    created_at = Column(TIMESTAMP, server_default=func.now())

    user = relationship("User", backref="gallery_collections")

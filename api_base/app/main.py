"""
FastAPI main application.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import base, auth

# Create FastAPI app
app = FastAPI(
    title="Hunyuan3D API",
    description="API for converting images to 3D models using Hunyuan3D-2.1",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(base.router, prefix="/api/v1", tags=["Base"])
app.include_router(auth.router, prefix="/api/v1", tags=["Authentication"])

@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Hunyuan3D API",
        "version": "1.0.0",
        "docs": "/docs"
    }
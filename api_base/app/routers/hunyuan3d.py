"""
Hunyuan3D Router - With Database Integration
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session
import base64
from io import BytesIO
from PIL import Image
import os
from pathlib import Path

from app.config import settings
from app.models.task import ModelJob  # ← Your DB model
from app.models.base_db import get_db  # ← Your database dependency
from app.security.security import get_current_admin  # ← Admin check dependency

# Import service
try:
    from app.services.hunyuan3d_service import hunyuan3d_service
except ImportError:
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from hunyuan3d_service_db import hunyuan3d_service


router = APIRouter()


# ============================================
# Request/Response Models
# ============================================

class Generate3DRequest(BaseModel):
    """Request model for 3D generation"""
    image_base64: str = Field(..., description="Base64 encoded image (PNG/JPG)")
    input_image_url: str = Field(..., description="URL of uploaded image")
    remove_background: bool = Field(True, description="Auto remove background")
    generate_texture: bool = Field(True, description="Generate PBR textures")
    
    class Config:
        json_schema_extra = {
            "example": {
                "image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAE...",
                "input_image_url": "https://example.com/uploads/image.png",
                "remove_background": True,
                "generate_texture": True
            }
        }


class Generate3DResponse(BaseModel):
    """Response model for 3D generation"""
    job_id: str = Field(..., description="Unique job identifier")
    status: str = Field(..., description="Job status: pending/processing/completed/failed")
    message: str = Field(..., description="Status message")


class JobStatusResponse(BaseModel):
    """Response model for job status"""
    job_id: str
    status: str
    input_image_url: str
    output_model_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class JobListResponse(BaseModel):
    """Response model for job list"""
    jobs: List[JobStatusResponse]
    total: int
    limit: int
    offset: int


class WorkerStatusResponse(BaseModel):
    """Response model for worker status"""
    initialized: bool
    device: str
    queue_length: int
    active_jobs: int


# ============================================
# Dependency for getting current user
# ============================================

from app.security.security import get_current_user
from app.models.user import User

async def get_current_user_id(
    current_user: User = Depends(get_current_user)
) -> int:
    return current_user.id

# ============================================
# API Endpoints
# ============================================

@router.post("/convert-3d", response_model=Generate3DResponse)
async def convert_image_to_3d(
    request: Generate3DRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Convert 2D image to 3D model with database tracking
    
    **Process:**
    1. Upload image (handled by file_upload router)
    2. Get input_image_url from upload response
    3. Submit this request with image_base64 + input_image_url
    4. Receive job_id
    5. Poll /job-status/{job_id} for results
    
    **Flow:**
    ```
    POST /upload → get input_image_url
    POST /convert-3d → get job_id
    GET /job-status/{job_id} → check progress
    GET /download/{job_id}.glb → download model
    ```
    """
    try:
        # Validate image
        try:
            image_bytes = base64.b64decode(request.image_base64)
            image = Image.open(BytesIO(image_bytes))
            print(f"📸 Received image: {image.size}, mode: {image.mode}")
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid image data: {str(e)}"
            )
        
        # Start generation with DB tracking
        result = await hunyuan3d_service.generate_3d(
            db=db,
            image_data=request.image_base64,
            input_image_url=request.input_image_url,
            remove_background=request.remove_background,
            generate_texture=request.generate_texture,
            user_id=user_id
        )
        
        # Schedule cleanup of old jobs
        background_tasks.add_task(
            hunyuan3d_service.cleanup_old_jobs,
            db,
            max_age_hours=24  # 24 hours
        )
        
        return Generate3DResponse(**result)
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Generation failed: {str(e)}"
        )


@router.post("/convert-3d/upload", response_model=Generate3DResponse)
async def convert_uploaded_image_to_3d(
    file: UploadFile = File(...),
    remove_background: bool = True,
    generate_texture: bool = True,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Convert uploaded image file to 3D model
    
    **Simplified endpoint:** Upload file directly, no need for separate upload step
    
    **Example using curl:**
    ```bash
    curl -X POST "http://localhost:8000/api/v1/convert-3d/upload" \\
         -H "Authorization: Bearer YOUR_TOKEN" \\
         -F "file=@image.png" \\
         -F "remove_background=true" \\
         -F "generate_texture=true"
    ```
    """
    try:
        # Read uploaded file
        contents = await file.read()
        
        # Validate it's an image
        try:
            image = Image.open(BytesIO(contents))
            print(f"📸 Uploaded image: {image.size}, mode: {image.mode}")
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid image file: {str(e)}"
            )
        
        # Save uploaded file
        upload_dir = Path(settings.UPLOAD_TEMP_DIR)
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        temp_filename = f"upload_{user_id}_{file.filename}"
        temp_path = upload_dir / temp_filename
        
        with open(temp_path, 'wb') as f:
            f.write(contents)
        
        # Generate input_image_url (adjust to your serving logic)
        input_image_url = f"{settings.API_HOST}/uploads/{temp_filename}"
        
        # Encode to base64
        image_base64 = base64.b64encode(contents).decode('utf-8')
        
        # Start generation
        result = await hunyuan3d_service.generate_3d(
            db=db,
            image_data=image_base64,
            input_image_url=input_image_url,
            remove_background=remove_background,
            generate_texture=generate_texture,
            user_id=user_id
        )
        
        # Schedule cleanup
        if background_tasks:
            background_tasks.add_task(
                hunyuan3d_service.cleanup_old_jobs,
                db,
                max_age_hours=24
            )
        
        return Generate3DResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Generation failed: {str(e)}"
        )


@router.get("/job-status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    db: Session = Depends(get_db)
):
    """
    Get status of a 3D generation job
    
    **Status values:**
    - `pending`: Job created, waiting to start
    - `processing`: Job is running
    - `completed`: Job finished successfully (output_model_url available)
    - `failed`: Job failed (error_message available)
    - `not_found`: Job ID not found
    
    **Polling example:**
    ```python
    import requests
    import time
    
    job_id = "abc-123"
    
    while True:
        status = requests.get(
            f"http://localhost:8000/api/v1/job-status/{job_id}",
            headers={"Authorization": "Bearer YOUR_TOKEN"}
        ).json()
        
        if status["status"] == "completed":
            print(f"Download: {status['output_model_url']}")
            break
        elif status["status"] == "failed":
            print(f"Failed: {status['error_message']}")
            break
        
        time.sleep(2)  # Poll every 2 seconds
    ```
    """
    try:
        status = await hunyuan3d_service.get_job_status(db, job_id)
        return JobStatusResponse(**status)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get status: {str(e)}"
        )


@router.get("/my-jobs", response_model=JobListResponse)
async def get_my_jobs(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Get all jobs for current user
    
    **Pagination:**
    - `limit`: Max number of jobs to return (default: 50)
    - `offset`: Number of jobs to skip (default: 0)
    
    **Example:**
    ```bash
    # Get first 10 jobs
    GET /api/v1/my-jobs?limit=10&offset=0
    
    # Get next 10 jobs
    GET /api/v1/my-jobs?limit=10&offset=10
    ```
    """
    try:
        jobs = await hunyuan3d_service.get_user_jobs(
            db=db,
            user_id=user_id,
            limit=limit,
            offset=offset
        )
        
        # Get total count
        total = db.query(ModelJob).filter(ModelJob.user_id == user_id).count()
        
        return JobListResponse(
            jobs=jobs,
            total=total,
            limit=limit,
            offset=offset
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get jobs: {str(e)}"
        )


@router.get("/download/{filename}")
async def download_model(filename: str):
    """
    Download generated 3D model file
    
    **URL format:** `/download/{job_id}.glb`
    
    **Example:**
    ```bash
    curl -O http://localhost:8000/api/v1/download/abc-123.glb
    ```
    
    **Note:** No authentication required for downloads (files are public)
    If you need auth, add `user_id: int = Depends(get_current_user_id)`
    """
    file_path = Path(settings.DOWNLOAD_DIR) / filename
    
    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Model file not found"
        )
    
    return FileResponse(
        path=file_path,
        media_type="model/gltf-binary",
        filename=filename
    )


@router.get("/worker-status", response_model=WorkerStatusResponse)
async def get_worker_status():
    """
    Get Hunyuan3D worker status
    
    Shows:
    - Whether worker is initialized
    - Device being used (CPU/CUDA)
    - Queue length
    - Active jobs count
    """
    try:
        status = hunyuan3d_service.get_worker_status()
        return WorkerStatusResponse(**status)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get worker status: {str(e)}"
        )


@router.post("/worker/initialize")
async def initialize_worker():
    """
    Manually initialize the worker
    
    **Use cases:**
    - Worker failed to start on server startup
    - Need to restart worker after crash
    - Admin endpoint for maintenance
    """
    try:
        await hunyuan3d_service.initialize_worker()
        return {
            "status": "success",
            "message": "Worker initialized successfully"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Worker initialization failed: {str(e)}"
        )


@router.delete("/job/{job_id}")
async def delete_job(
    job_id: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id)
):
    """
    Delete a job and its associated files
    
    **Authorization:** Only the job owner can delete their jobs
    
    **What gets deleted:**
    - Database record
    - Generated GLB file
    - Cached data
    """
    try:
        result = await hunyuan3d_service.delete_job(
            db=db,
            job_id=job_id,
            user_id=user_id  # ← Authorization check
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Delete failed: {str(e)}"
        )


@router.post("/admin/cleanup")
async def cleanup_old_jobs(
    max_age_hours: int = 24,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
    # Add admin check here:
    # is_admin: bool = Depends(check_admin_role)
):
    """
    Admin endpoint: Cleanup old completed/failed jobs
    
    **Parameters:**
    - `max_age_hours`: Delete jobs older than this (default: 24)
    
    **Requires admin role**
    """
    try:
        await hunyuan3d_service.cleanup_old_jobs(
            db=db,
            max_age_hours=max_age_hours
        )
        return {
            "status": "success",
            "message": f"Cleaned up jobs older than {max_age_hours} hours"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Cleanup failed: {str(e)}"
        )

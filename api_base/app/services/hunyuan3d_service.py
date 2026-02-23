"""
Hunyuan3D Service - With Database Integration
"""
import os
import sys
import uuid
import base64
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any
from io import BytesIO
from PIL import Image
from sqlalchemy.orm import Session

# Add Hunyuan3D paths
HUNYUAN3D_PATH = Path(__file__).parent.parent.parent / "hunyuan3d-2.1"
sys.path.insert(0, str(HUNYUAN3D_PATH))                  # ← ROOT path (model_worker.py here)
sys.path.insert(0, str(HUNYUAN3D_PATH / "hy3dshape"))
sys.path.insert(0, str(HUNYUAN3D_PATH / "hy3dpaint"))

from app.config import settings
from app.models.task import ModelJob

# Import after path setup
try:
    from model_worker import ModelWorker
    from api_models import GenerationRequest
    print("✅ Hunyuan3D modules imported successfully!")
    HUNYUAN3D_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Warning: Could not import Hunyuan3D modules: {e}")
    print("   Service will run in limited mode (API only, no 3D generation)")
    ModelWorker = None
    GenerationRequest = None
    HUNYUAN3D_AVAILABLE = False


class Hunyuan3DService:
    """Service for managing Hunyuan3D model operations with DB integration"""
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize the service (singleton pattern)"""
        if not self._initialized:
            self.worker = None  # ← Removed type hint
            self.task_cache: Dict[str, Dict[str, Any]] = {}
            self._initialized = True
            print("🎨 Hunyuan3D Service initialized (singleton)")
    
    async def initialize_worker(self):
        """Initialize the model worker"""
        if not HUNYUAN3D_AVAILABLE:
            print("⚠️ Cannot initialize worker: Hunyuan3D modules not available")
            print("   Install dependencies: pip install -r requirements-dev.txt")
            return
        
        if self.worker is not None:
            print("✅ Worker already initialized")
            return
        
        print("🚀 Initializing Hunyuan3D model worker...")
        
        # Create save directory
        save_dir = Path(settings.DOWNLOAD_DIR) / "hunyuan3d_cache"
        save_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize worker in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        self.worker = await loop.run_in_executor(
            None,
            self._create_worker,
            str(save_dir)
        )
        
        print("✅ Hunyuan3D worker ready!")
    
    def _create_worker(self, save_dir: str):  # ← Removed type hint
        """Create worker instance (runs in thread pool)"""
        if not HUNYUAN3D_AVAILABLE or ModelWorker is None:
            raise ImportError(
                "ModelWorker not available. "
                "Please install dependencies: pip install -r requirements-dev.txt"
            )
        
        return ModelWorker(
            model_path='tencent/Hunyuan3D-2.1',
            device=settings.HUNYUAN3D_DEVICE,
            low_vram_mode=(settings.HUNYUAN3D_DEVICE == 'cpu'),
            save_dir=save_dir,
            mc_algo='mc',
            enable_flashvdm=False,
            compile=False
        )
    
    async def generate_3d(
        self,
        db: Session,
        image_data: str,
        input_image_url: str,
        remove_background: bool = True,
        generate_texture: bool = True,
        user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generate 3D model from image with DB tracking
        
        Args:
            db: Database session
            image_data: Base64 encoded image
            input_image_url: URL of uploaded image (from file_upload service)
            remove_background: Whether to remove background
            generate_texture: Whether to generate texture
            user_id: User ID for tracking
            
        Returns:
            Dict with job_id and status
        """
        # Check if Hunyuan3D is available
        if not HUNYUAN3D_AVAILABLE:
            raise ImportError(
                "Hunyuan3D modules not available. "
                "Please install dependencies: pip install -r requirements-dev.txt"
            )
        
        # Ensure worker is initialized
        if self.worker is None:
            await self.initialize_worker()
        
        # Generate unique job ID (matching your DB field name)
        job_id = str(uuid.uuid4())
        
        # Create DB record with status='pending'
        job = ModelJob(
            user_id=user_id,
            job_id=job_id,
            status='pending',
            input_image_url=input_image_url
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        
        print(f"✅ Created job {job_id} in database")
        
        # Cache in memory for faster lookups (optional)
        self.task_cache[job_id] = {
            "status": "pending",
            "user_id": user_id,
            "created_at": asyncio.get_event_loop().time()
        }
        
        # Start generation in background
        asyncio.create_task(
            self._process_generation(
                job_id=job_id,
                image_data=image_data,
                remove_background=remove_background,
                generate_texture=generate_texture
            )
        )
        
        return {
            "job_id": job_id,
            "status": "pending",
            "message": "3D generation started"
        }
    
    async def _process_generation(self, job_id, image_data, remove_background, generate_texture):
        """Process generation in background with DB updates"""
        from app.models.base_db import SessionLocal
        db = SessionLocal()
        try:
            # Update status to 'processing'
            job = db.query(ModelJob).filter(ModelJob.job_id == job_id).first()
            if job:
                job.status = 'processing'
                db.commit()
                print(f"🔄 Job {job_id} status → processing")
            
            # Update cache
            if job_id in self.task_cache:
                self.task_cache[job_id]["status"] = "processing"
            
            # Prepare parameters
            params = {
                "image": image_data,
                "remove_background": remove_background,
                "texture": generate_texture
            }
            
            # Run generation in thread pool
            loop = asyncio.get_event_loop()
            file_path, uid = await loop.run_in_executor(
                None,
                self.worker.generate,
                job_id,
                params
            )
            
            print(f"✅ Generated model: {file_path}")
            
            # Generate output URL (adjust to your file serving logic)
            # Assuming you serve files from /download/{job_id}.glb
            output_model_url = f"{settings.EXTERNAL_URL}/download/{job_id}.glb"
            
            # Copy file to download directory with job_id name
            download_path = Path(settings.DOWNLOAD_DIR) / f"{job_id}.glb"
            import os
            os.rename(file_path, download_path)
            
            # Update DB: status='completed', output_model_url
            job = db.query(ModelJob).filter(ModelJob.job_id == job_id).first()
            if job:
                job.status = 'completed'
                job.output_model_url = output_model_url
                db.commit()
                print(f"✅ Job {job_id} completed → {output_model_url}")
            
            # Update cache
            if job_id in self.task_cache:
                self.task_cache[job_id]["status"] = "completed"
                self.task_cache[job_id]["output_model_url"] = output_model_url
            
        except Exception as e:
            print(f"❌ Job {job_id} failed: {str(e)}")
            
            # Update DB: status='failed', error_message
            job = db.query(ModelJob).filter(ModelJob.job_id == job_id).first()
            if job:
                job.status = 'failed'
                job.error_message = str(e)
                db.commit()
            
            # Update cache
            if job_id in self.task_cache:
                self.task_cache[job_id]["status"] = "failed"
                self.task_cache[job_id]["error"] = str(e)
        finally:
            db.close()
    async def get_job_status(
        self, 
        db: Session, 
        job_id: str
    ) -> Dict[str, Any]:
        """
        Get status of a generation job from database
        
        Args:
            db: Database session
            job_id: Job ID to query
            
        Returns:
            Dict with job status and details
        """
        # Try cache first (faster)
        if job_id in self.task_cache:
            cache_status = self.task_cache[job_id]["status"]
            if cache_status in ["pending", "processing"]:
                # Still processing, return cached status
                return {
                    "job_id": job_id,
                    "status": cache_status
                }
        
        # Query from database
        job = db.query(ModelJob).filter(ModelJob.job_id == job_id).first()
        
        if not job:
            return {
                "status": "not_found",
                "error": "Job ID not found"
            }
        
        response = {
            "job_id": job.job_id,
            "status": job.status,
            "input_image_url": job.input_image_url,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "updated_at": job.updated_at.isoformat() if job.updated_at else None
        }
        
        if job.status == "completed":
            response["output_model_url"] = job.output_model_url
        elif job.status == "failed":
            response["error_message"] = job.error_message
        
        return response
    
    async def get_user_jobs(
        self,
        db: Session,
        user_id: int,
        limit: int = 50,
        offset: int = 0
    ) -> list:
        """
        Get all jobs for a user
        
        Args:
            db: Database session
            user_id: User ID
            limit: Max number of jobs to return
            offset: Pagination offset
            
        Returns:
            List of jobs
        """
        jobs = db.query(ModelJob)\
            .filter(ModelJob.user_id == user_id)\
            .order_by(ModelJob.created_at.desc())\
            .limit(limit)\
            .offset(offset)\
            .all()
        
        return [{
            "job_id": job.job_id,
            "status": job.status,
            "input_image_url": job.input_image_url,
            "output_model_url": job.output_model_url,
            "error_message": job.error_message,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "updated_at": job.updated_at.isoformat() if job.updated_at else None
        } for job in jobs]
    
    async def delete_job(
        self,
        db: Session,
        job_id: str,
        user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Delete a job and its files
        
        Args:
            db: Database session
            job_id: Job ID to delete
            user_id: Optional user ID for authorization check
            
        Returns:
            Dict with success status
        """
        # Query job
        query = db.query(ModelJob).filter(ModelJob.job_id == job_id)
        if user_id:
            query = query.filter(ModelJob.user_id == user_id)
        
        job = query.first()
        
        if not job:
            return {
                "status": "error",
                "error": "Job not found or unauthorized"
            }
        
        # Delete file if exists
        if job.output_model_url:
            file_path = Path(settings.DOWNLOAD_DIR) / f"{job_id}.glb"
            if file_path.exists():
                try:
                    file_path.unlink()
                    print(f"🗑️  Deleted file: {file_path}")
                except Exception as e:
                    print(f"Failed to delete file: {e}")
        
        # Delete from database
        db.delete(job)
        db.commit()
        
        # Remove from cache
        if job_id in self.task_cache:
            del self.task_cache[job_id]
        
        return {
            "status": "success",
            "message": f"Job {job_id} deleted"
        }
    
    async def cleanup_old_jobs(
        self,
        db: Session,
        max_age_hours: int = 24
    ):
        """
        Clean up old completed/failed jobs
        
        Args:
            db: Database session
            max_age_hours: Delete jobs older than this many hours
        """
        from datetime import datetime, timedelta
        
        cutoff_time = datetime.now() - timedelta(hours=max_age_hours)
        
        # Query old jobs
        old_jobs = db.query(ModelJob)\
            .filter(ModelJob.status.in_(['completed', 'failed']))\
            .filter(ModelJob.created_at < cutoff_time)\
            .all()
        
        for job in old_jobs:
            # Delete file
            file_path = Path(settings.DOWNLOAD_DIR) / f"{job.job_id}.glb"
            if file_path.exists():
                try:
                    file_path.unlink()
                except Exception as e:
                    print(f"Failed to delete {file_path}: {e}")
            
            # Delete from DB
            db.delete(job)
            
            # Remove from cache
            if job.job_id in self.task_cache:
                del self.task_cache[job.job_id]
        
        db.commit()
        
        if old_jobs:
            print(f"🧹 Cleaned up {len(old_jobs)} old jobs")
    
    def get_worker_status(self) -> Dict[str, Any]:
        """Get worker status"""
        if self.worker is None:
            return {
                "initialized": False,
                "device": settings.HUNYUAN3D_DEVICE,
                "queue_length": 0,
                "active_jobs": 0,
                "hunyuan3d_available": HUNYUAN3D_AVAILABLE
            }
        
        # Count active jobs from cache
        active_jobs = len([
            t for t in self.task_cache.values() 
            if t["status"] in ["pending", "processing"]
        ])
        
        return {
            "initialized": True,
            "device": settings.HUNYUAN3D_DEVICE,
            "queue_length": self.worker.get_queue_length() if hasattr(self.worker, 'get_queue_length') else 0,
            "active_jobs": active_jobs,
            "hunyuan3d_available": HUNYUAN3D_AVAILABLE
        }


# Create singleton instance
hunyuan3d_service = Hunyuan3DService()
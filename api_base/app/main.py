"""
FastAPI main application.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.config import settings
from app.routers import base, auth, hunyuan3d
from app.routers import payment
from contextlib import asynccontextmanager
from app.services.hunyuan3d_service import hunyuan3d_service
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi động
    await hunyuan3d_service.initialize_worker()
    yield
    # Shutdown (nếu cần cleanup)
# Create FastAPI app
app = FastAPI(
    title="Hunyuan3D API",
    lifespan=lifespan,
    description="API for converting images to 3D models using Hunyuan3D-2.1",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# =========================================
# DEBUG: PRINT CORS CONFIG
# =========================================
print("\n" + "=" * 60)
print("🔍 CORS CONFIGURATION DEBUG")
print("=" * 60)
print(f"Type: {type(settings.ALLOWED_ORIGINS)}")
print(f"Value: {settings.ALLOWED_ORIGINS}")
print("=" * 60 + "\n")

# =========================================
# CORS MIDDLEWARE
# =========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("✅ CORS Middleware added successfully\n")

# Static files for downloads
download_dir = Path("utils/download")
download_dir.mkdir(parents=True, exist_ok=True)
app.mount("/download", StaticFiles(directory=str(download_dir)), name="download")

# Include routers
app.include_router(base.router, prefix="/api/v1", tags=["Base"])
app.include_router(auth.router, prefix="/api/v1", tags=["Authentication"])
app.include_router(hunyuan3d.router, prefix="/api/v1", tags=["3D Conversion"])
app.include_router(payment.router, prefix="/api/v1", tags=["Payment"])
@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Hunyuan3D API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "health": "/api/v1/health",
            "auth": "/api/v1/auth",
            "convert": "/api/v1/convert-3d"
        }
    }

# Add middleware to log all requests
@app.middleware("http")
async def log_requests(request, call_next):
    """Log all incoming requests."""
    print(f"📥 {request.method} {request.url.path} from {request.client.host}")
    response = await call_next(request)
    print(f"📤 Response status: {response.status_code}")
    return response
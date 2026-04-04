"""
FastAPI main application.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pathlib import Path
from contextlib import asynccontextmanager

from app.config import settings
from app.routers import base, auth, payment, gallery
from app.routers import hunyuan3d_mv
from app.routers import my_jobs  # <-- thêm

from app.services.hunyuan3d_mv_service import hunyuan3d_mv_service


# =========================================
# LIFESPAN — khởi động / tắt server
# =========================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("🚀 SERVER STARTING UP")
    print("=" * 60)

    # Hunyuan3D-2mv pipelines (multiview)
    #    Chỉ load shape pipeline lúc startup để tiết kiệm VRAM.
    #    Texture pipeline sẽ lazy-load khi có request đầu tiên.
    if settings.LOAD_MODEL_ON_STARTUP:
        try:
            await hunyuan3d_mv_service.initialize_shape_pipeline()
            print("✅ Hunyuan3D-2mv shape pipeline ready")
        except Exception as e:
            print(f"⚠️  Hunyuan3D-2mv shape pipeline failed: {e}")
            print("   → /generate-shape-mv sẽ không khả dụng.")
    else:
        print("⏭️  Shape pipeline skipped at startup (lazy-load on first request)")

    print("=" * 60 + "\n")

    yield  # Server chạy

    # ── Shutdown ─────────────────────────────────────────────
    print("\n🛑 Server shutting down...")


# =========================================
# APP INSTANCE
# =========================================

app = FastAPI(
    title="Hunyuan3D API",
    lifespan=lifespan,
    description=(
        "API chuyển đổi ảnh 2D → mô hình 3D (Hunyuan3D-2mv).\n\n"
        "**Multiview** (`/generate-shape-mv`, `/generate-texture-mv`): "
        "front + left + back → white mesh → textured 3D"
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


# =========================================
# CORS
# =========================================

print("\n" + "=" * 60)
print("🔍 CORS CONFIGURATION")
print("=" * 60)
print(f"Origins: {settings.ALLOWED_ORIGINS}")
print("=" * 60 + "\n")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
print("✅ CORS Middleware added\n")


# =========================================
# STATIC FILES
# =========================================

# Thư mục download — phục vụ cả .glb và .white.glb
download_dir = Path(settings.DOWNLOAD_DIR)
download_dir.mkdir(parents=True, exist_ok=True)
app.mount("/download-static", StaticFiles(directory=str(download_dir)), name="download-static")
# Lưu ý: dùng /download-static để tránh conflict với router /download/{job_id}/...

# Thư mục gallery
gallery_dir = Path("utils/gallery")
gallery_dir.mkdir(parents=True, exist_ok=True)
app.mount("/gallery-files", StaticFiles(directory=str(gallery_dir)), name="gallery-files")


# =========================================
# ROUTERS
# =========================================

# Base & Auth
app.include_router(base.router,      prefix="/api/v1", tags=["Base"])
app.include_router(auth.router,      prefix="/api/v1", tags=["Authentication"])

# 3D Multiview (Hunyuan3D-2mv)
app.include_router(hunyuan3d_mv.router, prefix="/api/v1", tags=["3D Multiview"])

# Payment & Gallery
app.include_router(payment.router,   prefix="/api/v1", tags=["Payment"])
app.include_router(gallery.router,   prefix="/api/v1", tags=["Gallery"])

# My Jobs (mới thêm)
app.include_router(my_jobs.router,   prefix="/api/v1", tags=["My Jobs"])


# =========================================
# ROOT
# =========================================

@app.get("/")
async def root():
    return {
        "message": "Hunyuan3D API v2.0",
        "docs": "/docs",
        "endpoints": {
            # Multiview — Stage 1
            "shape_mv_base64":     "POST /api/v1/generate-shape-mv",
            "shape_mv_upload":     "POST /api/v1/generate-shape-mv/upload",
            # Multiview — Stage 2
            "texture_mv_base64":   "POST /api/v1/generate-texture-mv",
            "texture_mv_upload":   "POST /api/v1/generate-texture-mv/upload",
            # Multiview — Download
            "download_white_mesh": "GET  /api/v1/download/{shape_job_id}/white",
            "download_textured_mv":"GET  /api/v1/download/{tex_job_id}/textured",
            # Status
            "job_status_mv":       "GET  /api/v1/job-status-mv/{job_id}",
            "worker_status_mv":    "GET  /api/v1/worker-status-mv",
        }
    }


# =========================================
# REQUEST LOGGER
# =========================================

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"📥 {request.method} {request.url.path} from {request.client.host}")
    response = await call_next(request)
    print(f"📤 {response.status_code}")
    return response
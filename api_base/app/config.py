"""
Configuration module.
"""

import os
from typing import List
from dotenv import load_dotenv

# Load .env file
load_dotenv()

class Settings:
    """Application settings."""
    
    # =========================================
    # DATABASE
    # =========================================
    DATABASE_HOST: str = os.getenv("DATABASE_HOST", "localhost")
    DATABASE_PORT: int = int(os.getenv("DATABASE_PORT", "3306"))
    DATABASE_USER: str = os.getenv("DATABASE_USER", "khuongn2k3")
    DATABASE_PASSWORD: str = os.getenv("DATABASE_PASSWORD", "")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "hunyuan3d_db")
    
    # =========================================
    # JWT & SECURITY
    # =========================================
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "43200"))
    
    # =========================================
    # CORS
    # =========================================
    @property
    def ALLOWED_ORIGINS(self) -> List[str]:
        """Parse ALLOWED_ORIGINS from .env or use defaults."""
        origins_str = os.getenv("ALLOWED_ORIGINS", "")
        if origins_str:
            # Split by comma and strip whitespace
            return [origin.strip() for origin in origins_str.split(",")]
        else:
            # Default origins for development
            return [
                "http://localhost:3000",
                "http://localhost:5173",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:5173",
            ]
    
    # =========================================
    # GOOGLE OAUTH (Optional)
    # =========================================
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/auth/google/callback")
    
    # =========================================
    # PAYMENT (Optional)
    # =========================================
    NAME_WEB: str = "HUNYUAN3D"
    SEPAY_API_KEY: str = os.getenv("SEPAY_API_KEY", "")
    SEPAY_WEBHOOK_SECRET: str = os.getenv("SEPAY_WEBHOOK_SECRET", "")
    
    # =========================================
    # HUNYUAN3D MODEL
    # =========================================
    HUNYUAN3D_MODEL_PATH: str = os.getenv("HUNYUAN3D_MODEL_PATH", "./hunyuan3d-2.1")
    @property
    def HUNYUAN3D_DEVICE(self) -> str:
        """Get device (cuda/cpu) with validation."""
        device = os.getenv("HUNYUAN3D_DEVICE", "cpu")
        
        # Validate
        if device not in ["cuda", "cpu"]:
            print(f"⚠️  Invalid HUNYUAN3D_DEVICE: {device}, fallback to cpu")
            return "cpu"
        
        # Check CUDA availability if cuda is requested
        if device == "cuda":
            try:
                import torch
                if not torch.cuda.is_available():
                    print("⚠️  CUDA requested but not available, fallback to cpu")
                    return "cpu"
            except ImportError:
                print("⚠️  PyTorch not installed, fallback to cpu")
                return "cpu"
        
        return device
    
    # =========================================
    # STORAGE PATHS
    # =========================================
    UPLOAD_TEMP_DIR: str = os.getenv("UPLOAD_TEMP_DIR", "./utils/upload_temp")
    DOWNLOAD_DIR: str = os.getenv("DOWNLOAD_DIR", "./utils/download")
    MODELS_CACHE_DIR: str = os.getenv("MODELS_CACHE_DIR", "./utils/models_cache")
    
    # =========================================
    # SERVER CONFIG
    # =========================================
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1", "yes")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    EXTERNAL_URL: str = os.getenv("EXTERNAL_URL", "http://localhost:8000")
    # =========================================
    # HELPER PROPERTIES
    # =========================================
    @property
    def DATABASE_URL(self) -> str:
        """Get SQLAlchemy database URL."""
        return f"mysql+pymysql://{self.DATABASE_USER}:{self.DATABASE_PASSWORD}@{self.DATABASE_HOST}:{self.DATABASE_PORT}/{self.DATABASE_NAME}"

# Create settings instance
settings = Settings()
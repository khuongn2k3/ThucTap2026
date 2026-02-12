"""
Configuration module.
"""

import os
from typing import List
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    """Application settings."""
    
    # Database
    DATABASE_HOST: str = os.getenv("DATABASE_HOST", "localhost")
    DATABASE_PORT: int = int(os.getenv("DATABASE_PORT", "3306"))
    DATABASE_USER: str = os.getenv("DATABASE_USER", "root")
    DATABASE_PASSWORD: str = os.getenv("DATABASE_PASSWORD", "")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "hunyuan3d_db")
    
    # JWT
    SECRET_KEY: str = os.getenv("SECRET_KEY", "unsafe-secret-key")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "43200"))
    
    # CORS
    ALLOWED_ORIGINS: List[str] = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    
    class Config:
        env_file = ".env"

settings = Settings()
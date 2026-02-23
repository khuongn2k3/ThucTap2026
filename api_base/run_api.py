"""
Script to run FastAPI server.

Usage:
    python run_api.py
"""

import uvicorn
from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.API_HOST,      # Đọc từ .env
        port=settings.API_PORT,      # Đọc từ .env
        reload=settings.DEBUG,       # Auto-reload nếu DEBUG=True
        log_level=settings.LOG_LEVEL.lower()  # Đọc từ .env
    )
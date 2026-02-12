# API Base - Hunyuan3D Backend

Backend Python FastAPI cho dự án chuyển ảnh sang 3D model sử dụng Hunyuan3D-2.1

## 📋 Yêu cầu hệ thống

- Python 3.10+
- MySQL 8.0+
- GPU NVIDIA với CUDA 11.8 (cho production)
- RAM: 16GB+ (32GB recommended)
- Disk: 50GB+ free space (cho model weights)

## 🚀 Cài đặt nhanh

### 1. Clone repository

```bash
git clone https://github.com/khuongn2k3/ThucTap2026.git
cd ThucTap2026/api_base
```

### 2. Tạo virtual environment

**Windows:**
```cmd
python -m venv venv
venv\Scripts\activate
```

**Linux/Mac:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Cài đặt dependencies

**Option A: Development (không cần GPU)**
```bash
pip install -r requirements.txt
```

**Option B: Production (có GPU NVIDIA)**
```bash
pip install -r requirements.txt
pip install -r requirements-ml.txt
```

### 4. Clone Hunyuan3D-2.1

⚠️ **QUAN TRỌNG:** Thư mục `hunyuan3d/` KHÔNG có trong Git, cần clone riêng:

```bash
git clone https://github.com/Tencent/Hunyuan3D-2 hunyuan3d
cd hunyuan3d
# Download model weights theo hướng dẫn của Tencent
```

### 5. Cấu hình môi trường

```bash
# Copy file .env.example
cp .env.example .env

# Chỉnh sửa file .env với thông tin thật
notepad .env  # Windows
nano .env     # Linux/Mac
```

### 6. Tạo database MySQL

```sql
CREATE DATABASE hunyuan3d_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hunyuan_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON hunyuan3d_db.* TO 'hunyuan_user'@'localhost';
FLUSH PRIVILEGES;
```

### 7. Chạy server

```bash
python run_api.py
```

Server: `http://localhost:8000`  
API Docs: `http://localhost:8000/docs`

## 📁 Cấu trúc thư mục

```
api_base/
├── app/                    # Source code chính
│   ├── main.py            # FastAPI entry point
│   ├── config.py          # Configuration
│   ├── models/            # Database models
│   ├── routers/           # API endpoints
│   ├── security/          # JWT, authentication
│   └── utils/             # Helper functions
├── utils/                 # Data folders
│   ├── models_cache/      # Model weights (gitignore)
│   ├── upload_temp/       # Temp uploads (gitignore)
│   └── download/          # Generated 3D files (gitignore)
├── test/                  # Unit tests
├── hunyuan3d/            # Hunyuan3D source (gitignore, phải clone riêng)
├── requirements.txt       # Core API dependencies (~100MB)
├── requirements-ml.txt    # ML inference dependencies (~10GB)
├── .env.example          # Environment template
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## 🔧 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Đăng ký
- `POST /api/v1/auth/login` - Đăng nhập
- `GET /api/v1/auth/google/login` - Google OAuth
- `GET /api/v1/auth/me` - Thông tin user

### Payment (SePay)
- `POST /api/v1/payment/create` - Tạo payment
- `POST /api/v1/payment/webhook` - SePay webhook
- `GET /api/v1/payment/history` - Lịch sử thanh toán

### Hunyuan3D
- `POST /api/v1/hunyuan3d/generate` - Generate 3D model
- `GET /api/v1/hunyuan3d/status/{task_id}` - Kiểm tra trạng thái
- `GET /api/v1/hunyuan3d/download/{task_id}` - Download file 3D

## 🔐 Environment Variables

Xem file `.env.example` để biết chi tiết.

Các biến quan trọng:
- `DATABASE_*`: Thông tin database MySQL
- `SECRET_KEY`: JWT secret key (phải random)
- `GOOGLE_CLIENT_ID/SECRET`: Google OAuth credentials
- `SEPAY_API_KEY`: SePay payment API key
- `HUNYUAN3D_MODEL_PATH`: Đường dẫn model weights

## 🧪 Testing

```bash
pytest test/
```

## 📝 Notes

- ⚠️ **Thư mục `hunyuan3d/` KHÔNG có trong Git**, phải clone riêng từ Tencent repo
- ⚠️ **Model weights (~8GB) cần download riêng**, không có trong Git
- ⚠️ **File `.env` chứa secrets**, KHÔNG được commit lên Git
- ✅ **Virtual environment `venv/`** tự tạo local, không push lên Git

## 📄 License

MIT License

## 👥 Team

- [@khuongn2k3](https://github.com/khuongn2k3)
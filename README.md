# 🧊 FORMA. — Nền tảng chuyển đổi ảnh 2D → Mô hình 3D

Dự án thực tập 2026 — Tích hợp mô hình **Hunyuan3D-2mv** của Tencent vào một web application hoàn chỉnh, cho phép người dùng upload ảnh và nhận về file 3D (.glb) chỉ trong vài phút.

---

## 📐 Kiến trúc tổng quan

```
┌─────────────────────┐        ┌──────────────────────────┐
│   Frontend (React)  │ ──────▶│   Backend API (FastAPI)   │
│   Vite + Tailwind   │        │   Python 3.10 + CUDA 12.4 │
│   Port: 3000        │        │   Port: 8000              │
└─────────────────────┘        └────────────┬─────────────┘
                                            │
                               ┌────────────▼─────────────┐
                               │   MySQL (hunyuan3d_db)    │
                               │   users / jobs / gallery  │
                               └──────────────────────────┘
```

**Backend** cung cấp REST API theo chuẩn `/api/v1/...`, tích hợp:
- Hunyuan3D-2mv pipeline (shape → texture)
- Google OAuth 2.0
- Gallery cộng đồng (chia sẻ model 3D)
- Quản trị admin

**Frontend** là SPA React, giao tiếp hoàn toàn qua API, hỗ trợ xem trước model 3D trực tiếp trong trình duyệt bằng Three.js.

---

## ⚙️ Yêu cầu hệ thống

| Thành phần | Yêu cầu tối thiểu |
|---|---|
| GPU VRAM | ≥ 24 GB (khuyến nghị RTX 3090 / A100) |
| CUDA | 12.4 |
| Python | 3.10 |
| Node.js | ≥ 18 |
| MySQL | 8.0+ |
| Disk | ≥ 40 GB |
| OS | Ubuntu 22.04 |

> **Ghi chú:** Dự án được thiết kế để chạy trên GPU server thuê (khuyến nghị [vast.ai](https://vast.ai)).

---

## 🚀 Hướng dẫn triển khai

### Bước 1 — Chuẩn bị SSH key

Tạo SSH key trên máy local và thêm vào trang quản lý của GPU provider:

```bash
ssh-keygen -t ed25519 -C "vastai"
cat ~/.ssh/id_ed25519.pub
```

### Bước 2 — Thuê GPU server (vast.ai)

Tạo template với cấu hình sau trước khi đặt máy:

| Thiết lập | Giá trị |
|---|---|
| Template Name | `PyTorch (Vast)` |
| Version Tag | `2.5.1-cuda-12.4.1-py310-22.04` |
| Port mở thêm | `8000 (TCP)`, `3000 (TCP)` |
| Disk Space | Tối thiểu 40 GB |

Sau khi máy chạy, SSH vào server.

### Bước 3 — Clone repository

```bash
git clone https://github.com/khuongn2k3/ThucTap2026.git
cd ThucTap2026
```

### Bước 4 — Cấu hình Tunnels (vast.ai)

Trong giao diện vast.ai, mở phần **Tunnels** và tạo hai tunnel:

```
http://localhost:8000   ← Backend API
http://localhost:3000   ← Frontend
```

Lưu lại cả hai URL tunnel — cần dùng khi setup:
- URL tunnel port 8000 → điền vào `EXTERNAL_URL` (Backend)
- URL tunnel port 3000 → điền vào `ALLOWED_ORIGINS` (Frontend CORS)

### Bước 5 — Chạy script cài đặt tự động

Script sẽ tự động cài MySQL, Python environment, tải weights từ HuggingFace, biên dịch CUDA modules và tạo file `.env`.

```bash
chmod +x quick_setup.sh
./quick_setup.sh
```

Hoặc nếu cần quyền root:

```bash
sudo bash quick_setup.sh
```

> ⏱️ **Thời gian ước tính: 30–50 phút** (phần lớn là tải weights từ HuggingFace)

Script sẽ hỏi lần lượt:
1. **HuggingFace Token** — lấy tại [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. **Google OAuth credentials** — Client ID và Client Secret từ Google Cloud Console
3. **External IP / domain** — URL tunnel của port 8000 (hoặc Enter để dùng localhost)

---

## 🖥️ Chạy ứng dụng

### Backend API

```bash
# Kích hoạt virtual environment
source venv/bin/activate

# Khởi động API server (port 8000)
python run_api.py
```

Sau khi khởi động, truy cập tài liệu API qua URL tunnel của port 8000 (dạng `https://xxxx-xxxx-xxxx-xxxx.trycloudflare.com`):
- Swagger UI: `https://xxxx-xxxx-xxxx-xxxx.trycloudflare.com/docs`
- ReDoc: `https://xxxx-xxxx-xxxx-xxxx.trycloudflare.com/redoc`

### Frontend

```bash
# Chạy từ thư mục frontend-react
cd frontend-react
npm run dev
```

Frontend truy cập qua URL tunnel của port 3000 (dạng `https://xxxx-xxxx-xxxx-xxxx.trycloudflare.com`)

---

## 🗂️ Cấu trúc thư mục

```
ThucTap2026/
├── api_base/                   # Backend FastAPI
│   ├── app/
│   │   ├── main.py             # Khởi tạo app, CORS, routers
│   │   ├── config.py           # Cấu hình từ .env
│   │   ├── models/             # ORM models (User, Job, Payment...)
│   │   ├── routers/            # Các nhóm endpoint API
│   │   │   ├── auth.py         # Đăng nhập / Google OAuth
│   │   │   ├── hunyuan3d_mv.py # Tạo model 3D (shape + texture)
│   │   │   ├── gallery.py      # Gallery cộng đồng
│   │   │   ├── my_jobs.py      # Lịch sử công việc
│   │   │   └── admin.py        # Quản trị
│   │   ├── services/           # Business logic
│   │   │   ├── hunyuan3d_mv_service.py   # Pipeline 3D chính
│   │   │   └── convert_service.py        # Chuyển đổi định dạng
│   │   └── security/           # JWT, xác thực
│   ├── quick_setup.sh          # Script cài đặt tự động
│   ├── run_api.py              # Entry point chạy server
│   └── requirements-gpu.txt   # Dependencies (GPU)
│
├── frontend-react/             # Frontend React + Vite
│   ├── src/
│   │   ├── pages/              # Trang chính (Home, Convert3D, Admin...)
│   │   ├── components/         # Components tái sử dụng
│   │   │   └── ModelViewer3D.jsx  # Viewer 3D (Three.js)
│   │   └── services/api.js     # Giao tiếp với Backend API
│   └── package.json
│
└── database/
    └── schema.sql              # Schema MySQL đầy đủ
```

---

## 🔐 Xác thực (Authentication)

API hỗ trợ 2 cách xác thực, tuỳ endpoint:

**1. JWT Bearer Token** — dùng cho auth, profile, gallery, my-jobs:
```http
Authorization: Bearer <token>
```
Lấy token bằng cách gọi `POST /api/v1/login` hoặc qua Google OAuth.

**2. API Key** — dùng cho các endpoint tạo 3D (generate):
```http
X-API-Key: sk_live_xxxx
```
API Key được tạo từ trang quản lý tài khoản, có quota theo tháng và có thể đặt ngày hết hạn. Mỗi lần gọi sẽ trừ vào quota của key.

> Các endpoint generate 3D chấp nhận **cả hai** — JWT hoặc API Key đều được.

---

## 🔌 API chính

### 🧊 3D Generation

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/v1/generate-shape-mv` | Tạo white mesh từ ảnh (base64) |
| `POST` | `/api/v1/generate-shape-mv/upload` | Tạo white mesh từ file upload |
| `POST` | `/api/v1/generate-texture-mv` | Thêm texture (base64) |
| `POST` | `/api/v1/generate-texture-mv/upload` | Thêm texture từ file upload |
| `POST` | `/api/v1/generate-full-mv` | Chạy full pipeline shape+texture (base64) |
| `POST` | `/api/v1/generate-full-mv/upload` | Chạy full pipeline từ file upload |
| `GET` | `/api/v1/job-status-mv/{job_id}` | Trạng thái job |
| `GET` | `/api/v1/job-progress-sse/{job_id}` | Stream tiến độ real-time (SSE) |
| `GET` | `/api/v1/download/{job_id}/white` | Tải white mesh (.glb) |
| `GET` | `/api/v1/download/{job_id}/textured` | Tải model có texture (.glb) |
| `GET` | `/api/v1/mesh-metrics/{job_id}` | Thống kê mesh (vertices, faces...) |
| `GET` | `/api/v1/worker-status-mv` | Trạng thái GPU worker |

### 🔐 Auth

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/v1/register` | Đăng ký tài khoản |
| `POST` | `/api/v1/login` | Đăng nhập |
| `GET` | `/api/v1/me` | Thông tin người dùng hiện tại |
| `POST` | `/api/v1/me/update` | Cập nhật thông tin cá nhân |
| `POST` | `/api/v1/me/change-password` | Đổi mật khẩu |
| `GET` | `/api/v1/google/redirect` | Bắt đầu luồng Google OAuth |
| `GET` | `/api/v1/google/callback` | Callback sau khi Google xác thực |

### 🖼️ Gallery

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/v1/gallery` | Danh sách model công khai |
| `POST` | `/api/v1/gallery/submit` | Đăng model lên gallery |
| `GET` | `/api/v1/gallery/by-slug/{slug}` | Xem model theo slug |
| `POST` | `/api/v1/gallery/{id}/like` | Thích model |
| `DELETE` | `/api/v1/gallery/{id}/like` | Bỏ thích |
| `POST` | `/api/v1/gallery/{id}/collect` | Lưu vào bộ sưu tập |

### 💼 My Jobs

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/v1/my-jobs` | Danh sách job của tôi |
| `GET` | `/api/v1/my-jobs/{job_id}/export` | Xuất file kết quả |
| `DELETE` | `/api/v1/my-jobs/{job_id}` | Xóa job |

### 🛡️ Admin

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/api/v1/admin/stats` | Thống kê tổng quan |
| `GET` | `/api/v1/admin/users` | Danh sách người dùng |
| `PATCH` | `/api/v1/admin/users/{id}/role` | Đổi role |
| `PATCH` | `/api/v1/admin/users/{id}/ban` | Ban/unban tài khoản |
| `PATCH` | `/api/v1/admin/users/{id}/tokens` | Điều chỉnh token |
| `DELETE` | `/api/v1/admin/users/{id}` | Xóa tài khoản |
| `GET` | `/api/v1/admin/jobs` | Danh sách tất cả jobs |

---

## 🔐 Biến môi trường quan trọng

File `.env` (tự động sinh bởi `quick_setup.sh`), các biến cần lưu ý:

| Biến | Mô tả |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth Client ID từ Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | Callback URL sau khi đăng nhập Google |
| `SECRET_KEY` | JWT secret key (tự sinh) |
| `DATABASE_*` | Thông tin kết nối MySQL |
| `EXTERNAL_URL` | URL công khai của API (tunnel hoặc IP thật) |
| `ALLOWED_ORIGINS` | Danh sách domain được phép CORS |
| `LOAD_MODEL_ON_STARTUP` | `True` để tải model ngay khi khởi động |

---

## 🛠️ Tech Stack

**Backend**
- FastAPI 0.100+ với async/await
- Python 3.10, CUDA 12.4
- Hunyuan3D-2mv (Tencent) — mô hình sinh 3D đa góc nhìn
- MySQL 8 + SQLAlchemy
- JWT + Google OAuth 2.0

**Frontend**
- React 18 + Vite 5
- Tailwind CSS 3
- Three.js (xem model 3D trực tiếp trên browser)
- Axios

---

## 📝 Ghi chú

- Lần đầu khởi động API, shape pipeline sẽ được load vào VRAM — có thể mất 1–2 phút.
- Texture pipeline được lazy-load ở request đầu tiên để tiết kiệm VRAM.
- Weights model lưu tại `api_base/weights/` và `utils/model_cache/` — **không commit** các thư mục này lên git.
- Nếu chạy qua Cloudflare Tunnel, nhập đầy đủ URL dạng `https://abc-xyz.trycloudflare.com` khi script hỏi external domain.

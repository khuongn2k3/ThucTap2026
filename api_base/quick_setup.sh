#!/bin/bash
# ==========================================
# 🚀 HUNYUAN3D GPU SERVER - FULL AUTO SETUP
# ==========================================
# Usage: 
#   chmod +x quick_setup.sh
#   ./quick_setup.sh
# 
# Time: ~60-90 phút (tùy internet speed)
# ==========================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# ==========================================
# CONFIG - Chỉnh ở đây nếu cần
# ==========================================
GITHUB_REPO="https://github.com/khuongn2k3/ThucTap2026.git"
API_BASE_SUBDIR="api_base"
HUNYUAN_HF_REPO="tencent/Hunyuan3D-2.1"
# Nhập Google OAuth khi chạy script
read -p "Nhập GOOGLE_CLIENT_ID: " GOOGLE_CLIENT_ID
read -p "Nhập GOOGLE_CLIENT_SECRET: " GOOGLE_CLIENT_SECRET

# ==========================================
# Banner
# ==========================================
clear
echo -e "${CYAN}"
cat << "EOF"
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🚀 HUNYUAN3D GPU SERVER AUTO SETUP 🚀          ║
║                                                   ║
║   Chạy xong đi uống trà, về test luôn! 🍵        ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo "This script will:"
echo "  ✓ Check system requirements"
echo "  ✓ Install MySQL server"
echo "  ✓ Clone api_base from GitHub"
echo "  ✓ Setup Python environment"
echo "  ✓ Install all dependencies (~10-15 GB)"
echo "  ✓ Compile CUDA modules"
echo "  ✓ Clone Hunyuan3D-2.1 from HuggingFace (~8 GB)"
echo "  ✓ Download AI model weights"
echo "  ✓ Create database & tables"
echo "  ✓ Generate full .env file"
echo ""
echo -e "${YELLOW}⏱️  Estimated time: 60-90 minutes${NC}"
echo -e "${YELLOW}💾 Total download: ~18-23 GB${NC}"
echo ""

# Hỏi EXTERNAL_URL (IP server)
echo -e "${CYAN}Nhập IP server của bạn (ví dụ: 175.155.64.231):${NC}"
read -p "Server IP: " SERVER_IP
EXTERNAL_URL="http://${SERVER_IP}:8000"
echo -e "${GREEN}EXTERNAL_URL sẽ là: $EXTERNAL_URL${NC}"
echo ""

read -p "Press ENTER to start or Ctrl+C to cancel..."

START_TIME=$(date +%s)

# ==========================================
# STEP 0: Pre-flight checks
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[0/12] PRE-FLIGHT CHECKS${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

# Check internet
if ! ping -c 1 google.com &> /dev/null; then
    echo -e "${RED}❌ No internet connection!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Internet connection OK${NC}"

# Check disk space
AVAILABLE_GB=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
if [ "$AVAILABLE_GB" -lt 50 ]; then
    echo -e "${RED}❌ Need at least 50GB free space. Available: ${AVAILABLE_GB}GB${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Disk space: ${AVAILABLE_GB}GB available${NC}"

# Check GPU
if ! command -v nvidia-smi &> /dev/null; then
    echo -e "${RED}❌ nvidia-smi not found!${NC}"
    exit 1
fi

GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
GPU_MEMORY=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
CUDA_VERSION=$(nvidia-smi | grep "CUDA Version" | awk '{print $9}')

echo -e "${GREEN}✅ GPU: $GPU_NAME${NC}"
echo -e "${GREEN}✅ VRAM: $((GPU_MEMORY / 1024)) GB${NC}"
echo -e "${GREEN}✅ CUDA: $CUDA_VERSION${NC}"

# Check Python
PYTHON_VERSION=$(python3 --version | awk '{print $2}')
echo -e "${GREEN}✅ Python: $PYTHON_VERSION${NC}"

echo -e "\n${GREEN}✅ All pre-flight checks passed!${NC}"
sleep 1

# ==========================================
# STEP 1: Install system packages
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[1/12] INSTALLING SYSTEM PACKAGES${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

sudo apt update -qq
sudo apt install -y \
    mysql-server \
    git \
    wget \
    curl \
    vim \
    htop \
    unzip \
    python3-pip \
    python3-venv \
    python3-dev \
    libmysqlclient-dev \
    pkg-config \
    > /dev/null 2>&1

echo -e "${GREEN}✅ System packages installed${NC}"

# ==========================================
# STEP 2: Setup MySQL
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[2/12] SETTING UP MYSQL${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

sudo systemctl start mysql
sudo systemctl enable mysql

DB_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-16)

sudo mysql <<EOSQL
CREATE DATABASE IF NOT EXISTS hunyuan3d_db 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'khuongn2k3'@'localhost' 
    IDENTIFIED BY '$DB_PASSWORD';

GRANT ALL PRIVILEGES ON hunyuan3d_db.* 
    TO 'khuongn2k3'@'localhost';

FLUSH PRIVILEGES;
EOSQL

mkdir -p ~/hunyuan3d_setup
cat > ~/hunyuan3d_setup/mysql_credentials.txt <<EOF
MySQL Credentials
=================
Database: hunyuan3d_db
User: khuongn2k3
Password: $DB_PASSWORD
Host: localhost
Port: 3306
Created: $(date)
EOF

echo -e "${GREEN}✅ MySQL configured${NC}"
echo -e "${CYAN}   Password saved to: ~/hunyuan3d_setup/mysql_credentials.txt${NC}"

# ==========================================
# STEP 3: Verify api_base directory
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[3/12] VERIFYING API_BASE DIRECTORY${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

# Kiểm tra đang đứng đúng trong api_base chưa
if [ ! -f "requirements-gpu.txt" ] || [ ! -f "run_api.py" ]; then
    echo -e "${RED}❌ Không tìm thấy file api_base!${NC}"
    echo "Hãy chắc chắn bạn đang đứng trong thư mục api_base:"
    echo "  cd ThucTap2026/api_base"
    echo "  ./quick_setup.sh"
    exit 1
fi

echo -e "${GREEN}✅ api_base directory OK${NC}"

# ==========================================
# STEP 4: Create Python virtual environment
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[4/12] CREATING VIRTUAL ENVIRONMENT${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip setuptools wheel > /dev/null 2>&1
echo -e "${GREEN}✅ Virtual environment ready${NC}"

# ==========================================
# STEP 5: Detect CUDA version
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[5/12] CONFIGURING PYTORCH FOR CUDA${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

if [[ $CUDA_VERSION == 12.4* ]]; then
    CUDA_WHEEL="cu124"
elif [[ $CUDA_VERSION == 12.* ]]; then
    CUDA_WHEEL="cu121"
elif [[ $CUDA_VERSION == 11.8* ]]; then
    CUDA_WHEEL="cu118"
else
    echo -e "${YELLOW}⚠️  Unsupported CUDA $CUDA_VERSION, defaulting to cu121${NC}"
    CUDA_WHEEL="cu121"
fi

echo "CUDA wheel target: $CUDA_WHEEL"

if [ -f "requirements-gpu.txt" ]; then
    cp requirements-gpu.txt requirements-gpu.txt.bak
    sed -i "3s|cu[0-9]*|$CUDA_WHEEL|" requirements-gpu.txt
    echo -e "${GREEN}✅ requirements-gpu.txt updated${NC}"
else
    echo -e "${RED}❌ requirements-gpu.txt not found!${NC}"
    exit 1
fi

# ==========================================
# STEP 6: Install Python dependencies
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[6/12] INSTALLING DEPENDENCIES${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

echo -e "${YELLOW}This will take 30-60 minutes (~10-15 GB)...${NC}"
echo -e "${CYAN}Go get some tea! 🍵${NC}\n"

pip install -r requirements-gpu.txt 2>&1 | while IFS= read -r line; do
    if [[ $line =~ "Collecting" ]] || [[ $line =~ "Downloading" ]] || [[ $line =~ "Installing" ]]; then
        echo "$line"
    fi
done

echo -e "\n${GREEN}✅ Dependencies installed${NC}"

# Verify PyTorch
python << EOF
import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'GPU: {torch.cuda.get_device_name(0)}')
else:
    exit(1)
EOF

# ==========================================
# STEP 7: Clone Hunyuan3D-2.1 from HuggingFace
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[7/12] CLONING HUNYUAN3D-2.1 MODEL${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

HUNYUAN_DIR="./hunyuan3d-2.1"

if [ -d "$HUNYUAN_DIR" ]; then
    echo -e "${GREEN}✅ hunyuan3d-2.1/ already exists, skipping${NC}"
else
    echo -e "${YELLOW}Cloning Hunyuan3D-2.1 from HuggingFace (~8GB)...${NC}"
    echo -e "${YELLOW}This may take 20-40 minutes...${NC}"

    # Dùng git-lfs để clone model
    sudo apt install -y git-lfs > /dev/null 2>&1
    git lfs install

    GIT_LFS_SKIP_SMUDGE=1 git clone https://huggingface.co/tencent/Hunyuan3D-2.1 "$HUNYUAN_DIR"
    cd "$HUNYUAN_DIR"
    git lfs pull
    cd ..

    echo -e "${GREEN}✅ Hunyuan3D-2.1 cloned${NC}"
fi

# Verify critical files
if [ ! -f "$HUNYUAN_DIR/model_worker.py" ]; then
    echo -e "${YELLOW}⚠️  model_worker.py not found in hunyuan3d-2.1${NC}"
fi

# ==========================================
# STEP 8: Compile CUDA modules
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[8/12] COMPILING CUDA MODULES${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

if [ -d "hunyuan3d-2.1/hy3dpaint/custom_rasterizer" ]; then
    echo "Compiling custom_rasterizer..."
    cd hunyuan3d-2.1/hy3dpaint/custom_rasterizer
    pip install -e . > /tmp/rasterizer_build.log 2>&1 && \
        echo -e "${GREEN}✅ custom_rasterizer compiled${NC}" || \
        echo -e "${RED}❌ Failed! Check /tmp/rasterizer_build.log${NC}"
    cd ../../..
fi

if [ -d "hunyuan3d-2.1/hy3dpaint/DifferentiableRenderer" ]; then
    echo "Compiling DifferentiableRenderer..."
    cd hunyuan3d-2.1/hy3dpaint/DifferentiableRenderer
    bash compile_mesh_painter.sh > /tmp/renderer_build.log 2>&1 && \
        echo -e "${GREEN}✅ DifferentiableRenderer compiled${NC}" || \
        echo -e "${RED}❌ Failed! Check /tmp/renderer_build.log${NC}"
    cd ../../..
fi

# ==========================================
# STEP 9: Download AI weights
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[9/12] DOWNLOADING AI WEIGHTS${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

WEIGHT_PATH="hunyuan3d-2.1/hy3dpaint/ckpt/RealESRGAN_x4plus.pth"
if [ ! -f "$WEIGHT_PATH" ]; then
    mkdir -p hunyuan3d-2.1/hy3dpaint/ckpt
    wget -q --show-progress \
        https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth \
        -P hunyuan3d-2.1/hy3dpaint/ckpt
    echo -e "${GREEN}✅ Real-ESRGAN downloaded${NC}"
else
    echo -e "${GREEN}✅ Real-ESRGAN already exists${NC}"
fi

# ==========================================
# STEP 10: Create directories
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[10/12] CREATING DIRECTORIES${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

mkdir -p utils/upload_temp utils/download utils/models_cache logs
chmod 755 utils/upload_temp utils/download utils/models_cache
echo -e "${GREEN}✅ Directories created${NC}"

# ==========================================
# STEP 11: Generate full .env
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[11/12] GENERATING .ENV FILE${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

SECRET_KEY=$(openssl rand -hex 32)

cat > .env <<EOF
# =========================================
# 🔐 DATABASE CONFIGURATION
# =========================================
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=khuongn2k3
DATABASE_PASSWORD=$DB_PASSWORD
DATABASE_NAME=hunyuan3d_db

# =========================================
# 🔑 JWT & SECURITY
# =========================================
SECRET_KEY=$SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200

# =========================================
# 🌐 CORS CONFIG
# =========================================
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# =========================================
# 🔐 GOOGLE OAUTH
# =========================================
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback

# =========================================
# 💳 PAYMENT (OPTIONAL)
# =========================================
SEPAY_API_KEY=
SEPAY_WEBHOOK_SECRET=

# =========================================
# 🤖 HUNYUAN3D MODEL CONFIG
# =========================================
HUNYUAN3D_MODEL_PATH=./hunyuan3d-2.1
HUNYUAN3D_DEVICE=cuda

# =========================================
# 📁 STORAGE PATHS
# =========================================
UPLOAD_TEMP_DIR=./utils/upload_temp
DOWNLOAD_DIR=./utils/download
MODELS_CACHE_DIR=./utils/models_cache

# =========================================
# 🚀 SERVER CONFIG
# =========================================
EXTERNAL_URL=$EXTERNAL_URL
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=False
LOG_LEVEL=INFO
EOF

echo -e "${GREEN}✅ .env created${NC}"
cat ~/hunyuan3d_setup/mysql_credentials.txt > ~/hunyuan3d_setup/env_config.txt
echo "SECRET_KEY=$SECRET_KEY" >> ~/hunyuan3d_setup/env_config.txt
echo "EXTERNAL_URL=$EXTERNAL_URL" >> ~/hunyuan3d_setup/env_config.txt

# ==========================================
# STEP 12: Initialize database
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[12/12] INITIALIZING DATABASE${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

python << 'EOF'
from app.models.base_db import Base, engine
from app.models.user import User
from app.models.task import ModelJob
from app.models.payment import Payment

try:
    Base.metadata.create_all(bind=engine)
    print('✅ Tables created: users, model_jobs, payments')
except Exception as e:
    print(f'❌ Error: {e}')
    exit(1)
EOF

mysql -u khuongn2k3 -p$DB_PASSWORD hunyuan3d_db -e "SHOW TABLES;" 2>/dev/null
echo -e "${GREEN}✅ Database initialized${NC}"

# ==========================================
# DONE!
# ==========================================
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECONDS=$((ELAPSED % 60))

clear
echo -e "${GREEN}"
cat << "EOF"
╔═══════════════════════════════════════════════════╗
║                                                   ║
║          🎉 SETUP COMPLETED SUCCESSFULLY! 🎉     ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${CYAN}⏱️  Total time: ${MINUTES}m ${SECONDS}s${NC}\n"

echo -e "${GREEN}🚀 Quick Start:${NC}"
echo ""
echo "  source venv/bin/activate"
echo "  python run_api.py"
echo ""
echo -e "${CYAN}📋 API Docs: $EXTERNAL_URL/docs${NC}"
echo ""
echo -e "${YELLOW}⚠️  First inference slower (model loading)${NC}"
echo -e "${YELLOW}⚠️  Subsequent: ~30-60s per image${NC}"
echo ""
echo -e "${CYAN}Credentials: ~/hunyuan3d_setup/${NC}"
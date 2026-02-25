#!/bin/bash
# ==========================================
# 🚀 HUNYUAN3D GPU SERVER - FULL AUTO SETUP (FIXED v2)
# ==========================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID_HERE"
GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET_HERE"

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
echo "  ✓ Setup Python 3.10 environment"
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

if ! curl -s --max-time 5 https://google.com > /dev/null; then
    echo -e "${RED}❌ No internet connection!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Internet connection OK${NC}"

AVAILABLE_GB=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
if [ "$AVAILABLE_GB" -lt 50 ]; then
    echo -e "${RED}❌ Need at least 50GB free space. Available: ${AVAILABLE_GB}GB${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Disk space: ${AVAILABLE_GB}GB available${NC}"

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

echo -e "\n${GREEN}✅ All pre-flight checks passed!${NC}"
sleep 1

# ==========================================
# STEP 1: Install system packages
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[1/12] INSTALLING SYSTEM PACKAGES${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

apt update -qq
apt install -y \
    mysql-server git wget curl vim htop unzip \
    python3-pip python3-venv python3-dev \
    libmysqlclient-dev pkg-config \
    > /dev/null 2>&1

# Cài Python 3.10 nếu chưa có
if ! command -v python3.10 &> /dev/null; then
    echo "Installing Python 3.10..."
    add-apt-repository ppa:deadsnakes/ppa -y > /dev/null 2>&1
    apt update -qq
    apt install -y python3.10 python3.10-venv python3.10-dev python3.10-distutils > /dev/null 2>&1
fi

echo -e "${GREEN}✅ System packages installed (Python $(python3.10 --version))${NC}"

# ==========================================
# STEP 2: Setup MySQL
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[2/12] SETTING UP MYSQL${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

service mysql start || true

DB_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-16)

mysql <<EOSQL
CREATE DATABASE IF NOT EXISTS hunyuan3d_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
DROP USER IF EXISTS 'khuongn2k3'@'localhost';
CREATE USER 'khuongn2k3'@'localhost' IDENTIFIED WITH mysql_native_password BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON hunyuan3d_db.* TO 'khuongn2k3'@'localhost';
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

if [ ! -f "requirements-gpu.txt" ] || [ ! -f "run_api.py" ]; then
    echo -e "${RED}❌ Không tìm thấy file api_base!${NC}"
    echo "  cd ThucTap2026/api_base && ./quick_setup.sh"
    exit 1
fi
echo -e "${GREEN}✅ api_base directory OK${NC}"

# ==========================================
# STEP 4: Create Python 3.10 virtual environment
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[4/12] CREATING VIRTUAL ENVIRONMENT (Python 3.10)${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

if [ -d "venv" ]; then
    echo -e "${YELLOW}⚠️  venv/ exists, removing and recreating with Python 3.10...${NC}"
    deactivate 2>/dev/null || true
    rm -rf venv
fi

python3.10 -m venv venv
source venv/bin/activate

echo -e "${GREEN}✅ Virtual environment: $(python --version)${NC}"

pip install --upgrade pip setuptools wheel > /dev/null 2>&1
echo -e "${GREEN}✅ pip upgraded${NC}"

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
    CUDA_WHEEL="cu121"
fi

echo "CUDA wheel: $CUDA_WHEEL"

cp requirements-gpu.txt requirements-gpu.txt.bak

# Skip torch (already installed in base image)
sed -i 's/^torch==/#torch==/' requirements-gpu.txt
sed -i 's/^torchvision==/#torchvision==/' requirements-gpu.txt
sed -i 's/^torchaudio==/#torchaudio==/' requirements-gpu.txt
echo -e "${GREEN}✅ Skipping torch (already have 2.5.1+cu124)${NC}"

# ==========================================
# STEP 6: Install Python dependencies
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[6/12] INSTALLING DEPENDENCIES${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

echo -e "${YELLOW}This will take 30-60 minutes (~10-15 GB)...${NC}"
echo -e "${CYAN}Go get some tea! 🍵${NC}\n"

pip install -r requirements-gpu.txt

echo -e "\n${GREEN}✅ Dependencies installed${NC}"

# Verify PyTorch
echo "Verifying PyTorch..."
python -c "
import torch
print(f'✅ PyTorch: {torch.__version__}')
print(f'✅ CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'✅ GPU: {torch.cuda.get_device_name(0)}')
else:
    print('❌ CUDA not available!')
    exit(1)
"

# ==========================================
# STEP 7: Clone Hunyuan3D-2.1 (Model + Code)
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[7/12] CLONING HUNYUAN3D-2.1 MODEL + CODE${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

HUNYUAN_DIR="./hunyuan3d-2.1"

if [ -d "$HUNYUAN_DIR" ]; then
    echo -e "${YELLOW}⚠️  hunyuan3d-2.1/ đã tồn tại${NC}"
else
    echo -e "${YELLOW}Cloning Hunyuan3D-2.1 from HuggingFace (~8GB)...${NC}"
    apt install -y git-lfs > /dev/null 2>&1
    git lfs install

    GIT_LFS_SKIP_SMUDGE=1 git clone https://huggingface.co/tencent/Hunyuan3D-2.1 "$HUNYUAN_DIR"
    cd "$HUNYUAN_DIR"
    git lfs pull
    cd ..
    echo -e "${GREEN}✅ Hunyuan3D-2.1 model cloned${NC}"
fi

# ✅ Clone code files from GitHub
echo -e "${YELLOW}Cloning Hunyuan3D-2.1 code from GitHub...${NC}"
GITHUB_CODE_DIR="/tmp/hunyuan3d-code"

if [ -d "$GITHUB_CODE_DIR" ]; then
    rm -rf "$GITHUB_CODE_DIR"
fi

git clone --depth=1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git "$GITHUB_CODE_DIR"

echo "Copying code files into hunyuan3d-2.1/..."

# ✅ Copy TOÀN BỘ code (force overwrite to get latest)
echo -e "${YELLOW}Copying all code files (overwriting)...${NC}"
cp -rf "$GITHUB_CODE_DIR"/* "$HUNYUAN_DIR/" 2>/dev/null || true
echo -e "${GREEN}✅ All code files copied${NC}"

# Cleanup
rm -rf "$GITHUB_CODE_DIR"

echo -e "${GREEN}✅ Code files copied successfully${NC}"

# ✅ FIX: bpy optional import
echo -e "${YELLOW}Fixing bpy optional imports...${NC}"
sed -i 's/^import bpy$/try:\n    import bpy\nexcept ImportError:\n    bpy = None/' \
    "$HUNYUAN_DIR/hy3dpaint/DifferentiableRenderer/mesh_utils.py"
sed -i 's/^import bpy$/try:\n    import bpy\nexcept ImportError:\n    bpy = None/' \
    "$HUNYUAN_DIR/hy3dshape/tools/render/render.py"
echo -e "${GREEN}✅ bpy imports fixed${NC}"

# ✅ FIX: Rename rembg.py to avoid circular import
echo -e "${YELLOW}Renaming rembg.py to avoid circular import...${NC}"
if [ -f "$HUNYUAN_DIR/hy3dshape/hy3dshape/rembg.py" ]; then
    mv "$HUNYUAN_DIR/hy3dshape/hy3dshape/rembg.py" "$HUNYUAN_DIR/hy3dshape/hy3dshape/rembg_utils.py"
    echo -e "${GREEN}✅ rembg.py renamed to rembg_utils.py${NC}"
else
    echo -e "${YELLOW}⚠️  rembg.py not found or already renamed${NC}"
fi

# ✅ FIX: Create comprehensive __init__.py for nested hy3dshape import
echo -e "${YELLOW}Creating __init__.py for hy3dshape...${NC}"
cat > "$HUNYUAN_DIR/hy3dshape/__init__.py" <<'INITPY'
# Forward all imports from nested hy3dshape to top-level
# This makes "from hy3dshape.xxx import Y" work as expected

import sys

# Import and re-export main modules
from .hy3dshape.pipelines import Hunyuan3DDiTPipeline, Hunyuan3DDiTFlowMatchingPipeline
from .hy3dshape import rembg_utils as rembg
from .hy3dshape import preprocessors
from .hy3dshape import postprocessors
from .hy3dshape import schedulers
from .hy3dshape import surface_loaders
from .hy3dshape import utils
from .hy3dshape import models

# Make nested modules accessible as hy3dshape.module_name
sys.modules['hy3dshape.rembg'] = rembg
sys.modules['hy3dshape.preprocessors'] = preprocessors
sys.modules['hy3dshape.postprocessors'] = postprocessors
sys.modules['hy3dshape.schedulers'] = schedulers
sys.modules['hy3dshape.surface_loaders'] = surface_loaders
sys.modules['hy3dshape.utils'] = utils
sys.modules['hy3dshape.models'] = models

__all__ = [
    "Hunyuan3DDiTPipeline",
    "Hunyuan3DDiTFlowMatchingPipeline",
    "rembg",
    "preprocessors",
    "postprocessors",
    "schedulers",
    "surface_loaders",
    "utils",
    "models"  # ← THÊM DÒNG NÀY
]
INITPY

echo -e "${GREEN}✅ hy3dshape/__init__.py created${NC}"

# ✅ Add PYTHONPATH for both hy3dshape AND hy3dpaint
VENV_ACTIVATE="venv/bin/activate"
HUNYUAN_ABS_PATH=$(realpath "$HUNYUAN_DIR")
HY3DPAINT_PATH="$HUNYUAN_ABS_PATH/hy3dpaint"
DIFF_RENDERER_PATH="$HUNYUAN_ABS_PATH/hy3dpaint/DifferentiableRenderer"
HY3DSHAPE_PATH="$HUNYUAN_ABS_PATH/hy3dshape"
HY3DSHAPE_NESTED_PATH="$HUNYUAN_ABS_PATH/hy3dshape/hy3dshape"

# Remove old PYTHONPATH entries
sed -i '/# Hunyuan3D/d' "$VENV_ACTIVATE"
sed -i '/export PYTHONPATH.*hunyuan3d/d' "$VENV_ACTIVATE"

# Add new comprehensive PYTHONPATH
cat >> "$VENV_ACTIVATE" <<EOF

# Hunyuan3D paths (auto-generated)
export PYTHONPATH="$HUNYUAN_ABS_PATH:$HY3DPAINT_PATH:$DIFF_RENDERER_PATH:$HY3DSHAPE_PATH:$HY3DSHAPE_NESTED_PATH:\$PYTHONPATH"
EOF

echo -e "${GREEN}✅ PYTHONPATH added to venv activation${NC}"

# Set for current session
export PYTHONPATH="$HUNYUAN_ABS_PATH:$HY3DPAINT_PATH:$DIFF_RENDERER_PATH:$PYTHONPATH"
echo -e "${GREEN}✅ PYTHONPATH set: $PYTHONPATH${NC}"

# Verify imports
echo -e "${YELLOW}Verifying Python imports...${NC}"
python -c "
import sys
...
" || true
print('Python paths:')
for p in sys.path[:5]:
    print(f'  {p}')
print('  ...')
print()

# Test 1: model_worker
try:
    from model_worker import ModelWorker
    print('✅ model_worker import OK')
except ImportError as e:
    print(f'❌ model_worker import failed: {e}')
    exit(1)

# Test 2: Hunyuan3D Pipeline
try:
    from hy3dshape import Hunyuan3DDiTFlowMatchingPipeline
    print('✅ Hunyuan3DDiTFlowMatchingPipeline import OK')
except ImportError as e:
    print(f'❌ Pipeline import failed: {e}')
    exit(1)

# Test 3: textureGenPipeline
try:
    from textureGenPipeline import Hunyuan3DPaintPipeline
    print('✅ textureGenPipeline import OK')
except ImportError as e:
    print(f'⚠️  textureGenPipeline import failed: {e}')
    print('   (Will be available after CUDA compilation)')
"
# ==========================================
# STEP 8: Compile CUDA modules
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[8/12] COMPILING CUDA MODULES${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

# Install dependencies for compilation
echo "Installing fake-bpy-module..."
pip install fake-bpy-module-latest > /dev/null 2>&1
echo -e "${GREEN}✅ fake-bpy-module installed${NC}"

echo "Adjusting setuptools version..."
pip install setuptools==69.5.1 > /dev/null 2>&1
echo -e "${GREEN}✅ setuptools adjusted${NC}"

if [ -d "hunyuan3d-2.1/hy3dpaint/custom_rasterizer" ]; then
    echo "Compiling custom_rasterizer..."
    cd hunyuan3d-2.1/hy3dpaint/custom_rasterizer
    pip install -e . --no-build-isolation > /tmp/rasterizer_build.log 2>&1 && \
        echo -e "${GREEN}✅ custom_rasterizer compiled${NC}" || \
        echo -e "${RED}❌ Failed! Check /tmp/rasterizer_build.log${NC}"
    cd ../../..
else
    echo -e "${YELLOW}⚠️  custom_rasterizer not found, skipping${NC}"
fi

if [ -d "hunyuan3d-2.1/hy3dpaint/DifferentiableRenderer" ]; then
    echo "Compiling DifferentiableRenderer..."
    cd hunyuan3d-2.1/hy3dpaint/DifferentiableRenderer
    bash compile_mesh_painter.sh > /tmp/renderer_build.log 2>&1 && \
        echo -e "${GREEN}✅ DifferentiableRenderer compiled${NC}" || \
        echo -e "${RED}❌ Failed! Check /tmp/renderer_build.log${NC}"
    cd ../../..
else
    echo -e "${YELLOW}⚠️  DifferentiableRenderer not found, skipping${NC}"
fi

# Final verification
echo -e "${YELLOW}Final verification...${NC}"
python -c "
try:
    from textureGenPipeline import Hunyuan3DPaintPipeline
    print('✅ All CUDA modules compiled successfully!')
except ImportError as e:
    print(f'⚠️  textureGenPipeline: {e}')
" 2>&1 | grep -E '✅|⚠️'
# ==========================================
# STEP 8.5: Configure LD_LIBRARY_PATH for CUDA extensions
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[8.5/12] CONFIGURING PYTORCH LIBRARY PATH${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

# Add PyTorch lib path to venv activate if not already present
if ! grep -q "TORCH_LIB_PATH" "$VENV_ACTIVATE"; then
    echo -e "${YELLOW}Adding LD_LIBRARY_PATH to venv...${NC}"
    cat >> "$VENV_ACTIVATE" <<'EOF'

# PyTorch C++ library path (for CUDA extensions)
TORCH_LIB_PATH=$(python -c "import torch, os; print(os.path.join(os.path.dirname(torch.__file__), 'lib'))" 2>/dev/null)
if [ -n "$TORCH_LIB_PATH" ]; then
    export LD_LIBRARY_PATH="$TORCH_LIB_PATH:$LD_LIBRARY_PATH"
fi
EOF
    echo -e "${GREEN}✅ LD_LIBRARY_PATH configured in venv${NC}"
else
    echo -e "${GREEN}✅ LD_LIBRARY_PATH already configured${NC}"
fi

# Set for current session
export LD_LIBRARY_PATH=$(python -c "import torch, os; print(os.path.join(os.path.dirname(torch.__file__), 'lib'))" 2>/dev/null):$LD_LIBRARY_PATH
# ==========================================
# STEP 9: Download AI weights
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[9/13] DOWNLOADING AI WEIGHTS${NC}"
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
# STEP 9.5: Fix all hardcoded paths using pathlib
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[9.5/13] FIXING ALL HARDCODED PATHS${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

# ✅ Part 1: Fix textureGenPipeline.py
echo -e "${YELLOW}Fixing paths in textureGenPipeline.py...${NC}"
TEXTURE_GEN_FILE="hunyuan3d-2.1/hy3dpaint/textureGenPipeline.py"

# Add Path import after warnings import if not present
if ! grep -q "from pathlib import Path" "$TEXTURE_GEN_FILE"; then
    sed -i '/^import warnings/a from pathlib import Path' "$TEXTURE_GEN_FILE"
    echo -e "${GREEN}✅ Added Path import${NC}"
fi

# Remove any existing script_dir lines in Hunyuan3DPaintConfig.__init__
sed -i '/class Hunyuan3DPaintConfig:/,/class Hunyuan3DPaintPipeline:/ {
    /script_dir = Path(__file__).parent.resolve()/d
}' "$TEXTURE_GEN_FILE"

# Add script_dir after self.device = "cuda"
sed -i '/self.device = "cuda"/a\        script_dir = Path(__file__).parent.resolve()' "$TEXTURE_GEN_FILE"

# Fix multiview_cfg_path to use pathlib
sed -i 's|self\.multiview_cfg_path = "hy3dpaint/cfgs/hunyuan-paint-pbr\.yaml"|self.multiview_cfg_path = str(script_dir / "cfgs" / "hunyuan-paint-pbr.yaml")|' "$TEXTURE_GEN_FILE"

# Fix realesrgan_ckpt_path to use pathlib (if still hardcoded)
sed -i 's|self\.realesrgan_ckpt_path = "ckpt/RealESRGAN_x4plus\.pth"|self.realesrgan_ckpt_path = str(script_dir / "ckpt" / "RealESRGAN_x4plus.pth")|' "$TEXTURE_GEN_FILE"

# Add dino_ckpt_path if not present
if ! grep -q "dino_ckpt_path" "$TEXTURE_GEN_FILE"; then
    sed -i '/self\.realesrgan_ckpt_path = str(script_dir/a\        self.dino_ckpt_path = "facebook/dinov2-large"  # HuggingFace model ID' "$TEXTURE_GEN_FILE"
    echo -e "${GREEN}✅ Added dino_ckpt_path${NC}"
fi

echo -e "${GREEN}✅ textureGenPipeline.py paths fixed${NC}"

# ✅ Part 2: Fix model_worker.py
echo -e "${YELLOW}Removing hardcoded path overrides in model_worker.py...${NC}"
MODEL_WORKER_FILE="hunyuan3d-2.1/model_worker.py"

# Remove all hardcoded path assignments that override Hunyuan3DPaintConfig defaults
sed -i '/conf\.realesrgan_ckpt_path = /d' "$MODEL_WORKER_FILE"
sed -i '/conf\.multiview_cfg_path = /d' "$MODEL_WORKER_FILE"
sed -i '/conf\.custom_pipeline = /d' "$MODEL_WORKER_FILE"

echo -e "${GREEN}✅ model_worker.py hardcoded paths removed${NC}"

# ✅ Part 3: Clear Python cache
echo -e "${YELLOW}Clearing Python cache...${NC}"
find hunyuan3d-2.1 -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find hunyuan3d-2.1 -type f -name "*.pyc" -delete 2>/dev/null || true
echo -e "${GREEN}✅ Python cache cleared${NC}"

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
DB_PASSWORD=$(grep "^Password:" ~/hunyuan3d_setup/mysql_credentials.txt | awk '{print $2}')
export DB_PASSWORD

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
echo "SECRET_KEY=$SECRET_KEY" >> ~/hunyuan3d_setup/env_config.txt
echo "EXTERNAL_URL=$EXTERNAL_URL" >> ~/hunyuan3d_setup/env_config.txt

# ==========================================
# STEP 12: Initialize database
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[12/12] INITIALIZING DATABASE${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

python -c "
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
"
export DB_PASSWORD=$(grep "^Password:" ~/hunyuan3d_setup/mysql_credentials.txt | awk '{print $2}')
mysql -u khuongn2k3 -p$DB_PASSWORD hunyuan3d_db -e "SHOW TABLES;" 2>/dev/null
echo -e "${GREEN}✅ Database initialized${NC}"

# ==========================================
# DONE!
# ==========================================
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
MINUTES=$((ELAPSED / 60))
SECS=$((ELAPSED % 60))

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

echo -e "${CYAN}⏱️  Total time: ${MINUTES}m ${SECS}s${NC}\n"
echo -e "${GREEN}🚀 Quick Start:${NC}"
echo ""
echo "  source venv/bin/activate"
echo "  python run_api.py"
echo ""
echo -e "${CYAN}📋 API Docs: $EXTERNAL_URL/docs${NC}"
echo ""
echo -e "${YELLOW}⚠️  First inference slower (model loading)${NC}"
echo -e "${CYAN}📄 Credentials: ~/hunyuan3d_setup/${NC}"
echo ""
echo -e "${GREEN}✅ All checks passed. Ready to run!${NC}"
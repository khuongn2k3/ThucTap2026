#!/bin/bash
# ==========================================
# 🚀 HUNYUAN3D-2MV GPU SERVER - AUTO SETUP
# ==========================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Nhap Google OAuth credentials ──
echo -e "${CYAN}🔑 Nhap Google OAuth Client ID (console.cloud.google.com):${NC}"
read -rp "   GOOGLE_CLIENT_ID: " GOOGLE_CLIENT_ID
if [ -z "$GOOGLE_CLIENT_ID" ]; then
    echo -e "${YELLOW}⚠️  Bo qua Google OAuth (co the them sau vao .env)${NC}"
    GOOGLE_CLIENT_ID=""
fi

echo -e "${CYAN}🔑 Nhap Google OAuth Client Secret:${NC}"
read -rp "   GOOGLE_CLIENT_SECRET: " GOOGLE_CLIENT_SECRET
if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    GOOGLE_CLIENT_SECRET=""
fi

# ── HuggingFace token (lay tai huggingface.co/settings/tokens) ──
if [ -z "$HF_TOKEN" ] || [ "$HF_TOKEN" = "YOUR_HUGGINGFACE_TOKEN_HERE" ]; then
    echo -e "${CYAN}🔑 Nhap HuggingFace Token (huggingface.co/settings/tokens):${NC}"
    read -rp "   HF_TOKEN: " HF_TOKEN
    echo ""
    if [ -z "$HF_TOKEN" ]; then
        echo -e "${RED}❌ HF_TOKEN khong duoc de trong!${NC}"
        exit 1
    fi
fi

clear
echo -e "${CYAN}"
cat << "EOF"
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🚀 HUNYUAN3D-2MV GPU SERVER AUTO SETUP 🚀      ║
║                                                   ║
║   Chay xong di uong tra, ve test luon! 🍵        ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo "This script will:"
echo "  ✓ Check system requirements"
echo "  ✓ Install MySQL server"
echo "  ✓ Setup Python 3.10 environment"
echo "  ✓ Install all dependencies"
echo "  ✓ Download project tu HuggingFace"
echo "  ✓ Compile CUDA modules (hunyuan3d-2mv)"
echo "  ✓ Create database & tables"
echo "  ✓ Generate full .env file"
echo ""
echo -e "${YELLOW}⏱️  Thoi gian uoc tinh: 30-50 phut${NC}"
echo -e "${YELLOW}💾 Download: tu HuggingFace (khuongn2k3/khuong_mv)${NC}"
echo ""

read -p "Nhan ENTER de bat dau hoac Ctrl+C de huy..."

# ── Nhap tunnel/IP backend ──
echo ""
echo -e "${CYAN}🌐 Nhap Backend Tunnel URL (IP thue hoac Cloudflare tunnel):${NC}"
echo -e "${YELLOW}   Vi du: 203.0.113.45  hoac  https://abc-xyz.trycloudflare.com${NC}"
read -rp "   BACKEND_URL (Enter de dung mac dinh http://localhost:8000): " EXTERNAL_INPUT

if [ -n "$EXTERNAL_INPUT" ]; then
    # Kiem tra neu da co http:// hoac https:// thi dung nguyen
    if [[ "$EXTERNAL_INPUT" =~ ^https?:// ]]; then
        # Domain day du (VD: Cloudflare Tunnel)
        EXTERNAL_BASE="${EXTERNAL_INPUT%/}"   # bo trailing slash neu co
        # Xac dinh scheme
        SCHEME=$(echo "$EXTERNAL_BASE" | grep -o '^https\?')
        DOMAIN=$(echo "$EXTERNAL_BASE" | sed 's|^https\?://||')
        ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173,${EXTERNAL_BASE}"
        GOOGLE_REDIRECT_URI="${EXTERNAL_BASE}/api/v1/auth/google/callback"
        EXTERNAL_URL="${EXTERNAL_BASE}"
        echo -e "${GREEN}✅ Domain ngoai: $EXTERNAL_BASE${NC}"
        echo -e "${CYAN}   (dang domain day du — khong ghep port)${NC}"
    else
        # Chi la IP thuan (VD: 203.0.113.45)
        EXTERNAL_BASE="http://${EXTERNAL_INPUT}"
        ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173,http://${EXTERNAL_INPUT}:3000,http://${EXTERNAL_INPUT}:5173,http://${EXTERNAL_INPUT}:8000"
        GOOGLE_REDIRECT_URI="http://${EXTERNAL_INPUT}:8000/api/v1/auth/google/callback"
        EXTERNAL_URL="http://${EXTERNAL_INPUT}:8000"
        echo -e "${GREEN}✅ IP thue: $EXTERNAL_INPUT${NC}"
        echo -e "${CYAN}   (dang IP — tu ghep port 8000)${NC}"
    fi
    echo -e "${CYAN}   ALLOWED_ORIGINS : $ALLOWED_ORIGINS${NC}"
    echo -e "${CYAN}   EXTERNAL_URL     : $EXTERNAL_URL${NC}"
    echo -e "${CYAN}   REDIRECT_URI     : $GOOGLE_REDIRECT_URI${NC}"
else
    echo -e "${CYAN}ℹ️  Chi dung localhost${NC}"
    ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173"
    GOOGLE_REDIRECT_URI="http://localhost:8000/api/v1/auth/google/callback"
    EXTERNAL_URL="http://localhost:8000"
fi

# ── Nhap Frontend URL ──
echo ""
echo -e "${CYAN}🌐 Nhap Frontend URL (noi nguoi dung truy cap giao dien):${NC}"
echo -e "${YELLOW}   Vi du: http://localhost:3000  hoac  https://frontend.trycloudflare.com${NC}"
read -rp "   FRONTEND_URL (Enter de dung mac dinh http://localhost:3000): " FRONTEND_URL
if [ -z "$FRONTEND_URL" ]; then
    FRONTEND_URL="http://localhost:3000"
    echo -e "${CYAN}ℹ️  Dung mac dinh: http://localhost:3000${NC}"
else
    FRONTEND_URL="${FRONTEND_URL%/}"  # bo trailing slash neu co
    echo -e "${GREEN}✅ Frontend URL: $FRONTEND_URL${NC}"
fi
echo ""

START_TIME=$(date +%s)

# ==========================================
# STEP 0: Pre-flight checks
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[0/10] PRE-FLIGHT CHECKS${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

if ! curl -s --max-time 5 https://google.com > /dev/null; then
    echo -e "${RED}❌ No internet connection!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Internet connection OK${NC}"

AVAILABLE_GB=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
if [ "$AVAILABLE_GB" -lt 30 ]; then
    echo -e "${RED}❌ Can it nhat 30GB disk. Hien co: ${AVAILABLE_GB}GB${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Disk space: ${AVAILABLE_GB}GB available${NC}"

if ! command -v nvidia-smi &> /dev/null; then
    echo -e "${RED}❌ nvidia-smi not found! Can GPU de chay Hunyuan3D${NC}"
    exit 1
fi

GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
GPU_MEMORY=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
CUDA_VERSION=$(nvidia-smi | grep "CUDA Version" | awk '{print $9}')
GPU_MEMORY_GB=$((GPU_MEMORY / 1024))

echo -e "${GREEN}✅ GPU: $GPU_NAME${NC}"
echo -e "${GREEN}✅ VRAM: ${GPU_MEMORY_GB} GB${NC}"
echo -e "${GREEN}✅ CUDA: $CUDA_VERSION${NC}"

if [ "$GPU_MEMORY_GB" -lt 16 ]; then
    echo -e "${YELLOW}⚠️  Hunyuan3D-2mv can ~14GB VRAM. Hien co ${GPU_MEMORY_GB}GB${NC}"
    echo -e "${YELLOW}   Shape + Texture khong the chay dong thoi.${NC}"
fi

if [ ! -f "requirements-gpu.txt" ] || [ ! -f "run_api.py" ]; then
    echo -e "${RED}❌ Script phai chay tu trong thu muc api_base/${NC}"
    echo "   cd api_base && bash quick_setup.sh"
    exit 1
fi
echo -e "${GREEN}✅ Running from api_base/ — OK${NC}"

# Check torch + CUDA ngay tu dau
SYSTEM_TORCH=0
# Tim tat ca python co tren he thong
PYTHON_CANDIDATES=(
    /venv/main/bin/python3
    /venv/main/bin/python
    $(find /venv /opt/conda -name "python3" -type f 2>/dev/null | head -5)
    python3.10
    python3
    python
)

for PY_BIN in "${PYTHON_CANDIDATES[@]}"; do
    if command -v "$PY_BIN" &>/dev/null; then
        if $PY_BIN -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
            TORCH_VER=$($PY_BIN -c "import torch; print(torch.__version__)")
            echo -e "${GREEN}✅ PyTorch: ${TORCH_VER} + CUDA (via ${PY_BIN}) — se bo qua cai o Step 4${NC}"
            SYSTEM_TORCH=1
            TORCH_PYTHON="$PY_BIN"
            break
        fi
    fi
done
if [ "$SYSTEM_TORCH" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  PyTorch chua co — se tai o Step 4${NC}"
fi

echo -e "\n${GREEN}✅ All pre-flight checks passed!${NC}"
sleep 1

# ==========================================
# STEP 1: Install system packages
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[1/10] INSTALLING SYSTEM PACKAGES${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

apt update -qq
apt install -y \
    mysql-server git wget curl vim htop unzip \
    python3-pip python3-venv python3-dev \
    libmysqlclient-dev pkg-config \
    build-essential ninja-build \
    > /dev/null 2>&1

# Cai Python 3.10 neu chua co
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
echo -e "${MAGENTA}[2/10] SETTING UP MYSQL${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

service mysql start || true
sleep 3

DB_PASSWORD="123123"

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
# STEP 3: Create Python 3.10 virtual environment
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[3/10] CREATING VIRTUAL ENVIRONMENT (Python 3.10)${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

if [ -d "venv" ]; then
    echo -e "${GREEN}✅ venv/ da ton tai, dung lai (bo qua tao moi)${NC}"
    source venv/bin/activate
else
    echo -e "${CYAN}   Tao venv voi --system-site-packages (ke thua torch tu system)${NC}"
    python3.10 -m venv venv --system-site-packages
    source venv/bin/activate
fi

echo -e "${GREEN}✅ Virtual environment: $(python --version)${NC}"

# Neu torch nam trong venv khac (vi du /venv/main), add site-packages vao .pth
if [ "$SYSTEM_TORCH" -eq 1 ] && ! python -c "import torch" 2>/dev/null; then
    TORCH_SITE=$($TORCH_PYTHON -c "import site; print(site.getsitepackages()[0])" 2>/dev/null)
    if [ -n "$TORCH_SITE" ]; then
        echo "$TORCH_SITE" > venv/lib/python3.10/site-packages/vastai_torch.pth
        echo -e "${GREEN}✅ Linked torch site-packages: $TORCH_SITE${NC}"
    fi
fi

pip install --upgrade pip setuptools wheel > /dev/null 2>&1
echo -e "${GREEN}✅ pip upgraded${NC}"

# ==========================================
# STEP 4: Detect CUDA & Install PyTorch
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[4/10] CONFIGURING PYTORCH FOR CUDA${NC}"
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

# Comment out torch trong requirements de tranh conflict
sed -i 's/^torch==/#torch==/' requirements-gpu.txt
sed -i 's/^torchvision==/#torchvision==/' requirements-gpu.txt
sed -i 's/^torchaudio==/#torchaudio==/' requirements-gpu.txt

# Kiem tra torch + CUDA da co san
if python -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
    TORCH_VER=$(python -c "import torch; print(torch.__version__)")
    GPU_DEV=$(python -c "import torch; print(torch.cuda.get_device_name(0))")
    echo -e "${GREEN}✅ PyTorch ${TORCH_VER} + CUDA da co san (${GPU_DEV}), bo qua cai${NC}"
else
    echo -e "${YELLOW}PyTorch chua co hoac CUDA chua kha dung, dang cai voi wheel: $CUDA_WHEEL...${NC}"
    pip install torch torchvision torchaudio \
        --index-url https://download.pytorch.org/whl/${CUDA_WHEEL}
    echo -e "${GREEN}✅ PyTorch installed${NC}"
fi

# ==========================================
# STEP 5: Install Python dependencies
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[5/10] INSTALLING PYTHON DEPENDENCIES${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

if python -c "import fastapi, uvicorn, sqlalchemy" 2>/dev/null; then
    echo -e "${GREEN}✅ Dependencies da cai san, bo qua Step 5${NC}"
else
    echo -e "${YELLOW}Cai packages, mat 15-30 phut...${NC}\n"

    # Cai basicsr truoc voi --no-build-isolation de tranh pip tu tai torch (~530MB) trong khi da co san
    echo -e "${CYAN}Pre-installing basicsr (skip isolated build to reuse existing torch)...${NC}"
    pip install basicsr==1.4.2 --no-build-isolation \
        && echo -e "${GREEN}✅ basicsr installed${NC}" \
        || echo -e "${YELLOW}⚠️  basicsr install failed, se thu lai cung requirements...${NC}"

    # Fix basicsr: torchvision >= 0.15 da bo functional_tensor, dung functional thay the
    sed -i 's/from torchvision.transforms.functional_tensor import rgb_to_grayscale/from torchvision.transforms.functional import rgb_to_grayscale/' \
        venv/lib/python3.10/site-packages/basicsr/data/degradations.py \
        && echo -e "${GREEN}✅ basicsr/degradations.py patched${NC}" \
        || echo -e "${YELLOW}⚠️  basicsr patch skip (file khong ton tai hoac da duoc fix)${NC}"

    pip install -r requirements-gpu.txt --no-build-isolation
    echo -e "\n${GREEN}✅ Dependencies installed${NC}"
fi
pip install -q huggingface_hub  # can de download HuggingFace

# Verify PyTorch + CUDA
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
# STEP 6: Download project tu HuggingFace
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[6/10] DOWNLOADING & EXTRACTING FROM HUGGINGFACE${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

MV_DIR="./hunyuan3d-2mv"

if [ -d "$MV_DIR" ] && [ -d "$MV_DIR/hy3dgen" ] && [ -d "$MV_DIR/hunyuan3d-dit-v2-mv-fast" ]; then
    echo -e "${GREEN}✅ hunyuan3d-2mv/ da ton tai va day du, bo qua download${NC}"
else
    # Cai pv de co progress bar
    apt install -y pv > /dev/null 2>&1 && PV_OK=1 || PV_OK=0

    HF_REPO="khuongn2k3/khuong_mv"
    HF_FILENAME="hunyuan3d-2mv.tar.gz"
    HF_ARCHIVE="./hunyuan3d-2mv.tar.gz"

    echo -e "${YELLOW}📥 Dang tai tu HuggingFace...${NC}"
    echo -e "${CYAN}   File ~9GB — uoc tinh 3-10 phut tuy bang thong${NC}\n"

    huggingface-cli download "$HF_REPO" "$HF_FILENAME" \
        --repo-type model \
        --local-dir . \
        --token "$HF_TOKEN" \
        && echo -e "${GREEN}✅ Download thanh cong${NC}" \
        || { echo -e "${RED}❌ Download that bai!${NC}"; exit 1; }

    # Kiem tra file
    ARCHIVE_SIZE=$(du -m "$HF_ARCHIVE" 2>/dev/null | cut -f1)
    echo -e "${CYAN}   File size: ${ARCHIVE_SIZE} MB${NC}"
    if [ "${ARCHIVE_SIZE:-0}" -lt 10 ]; then
        echo -e "${RED}❌ File download qua nho (${ARCHIVE_SIZE} MB)${NC}"
        rm -f "$HF_ARCHIVE"
        exit 1
    fi

    # Giai nen voi progress
    echo -e "${YELLOW}📦 Dang giai nen...${NC}"
    if [ "$PV_OK" -eq 1 ]; then
        pv "$HF_ARCHIVE" | tar -xz -C .
    else
        tar -xzvf "$HF_ARCHIVE" -C .
    fi

    rm -f "$HF_ARCHIVE"
    echo -e "${GREEN}✅ Giai nen xong, da xoa file .tar.gz${NC}"

    # ── Xac nhan cau truc sau giai nen ──
    if [ ! -d "$MV_DIR" ]; then
        # Truong hop tar giai nen khong co wrapper folder
        if [ -d "./hy3dgen" ]; then
            mkdir -p "$MV_DIR"
            mv ./hy3dgen ./hunyuan3d-dit-v2-mv-fast ./hunyuan3d-paint-v2-0 "$MV_DIR/" 2>/dev/null || true
            echo -e "${GREEN}✅ Da gom vao hunyuan3d-2mv/${NC}"
        else
            echo -e "${RED}❌ Khong tim thay hunyuan3d-2mv/ sau khi giai nen${NC}"
            echo -e "${YELLOW}   Kiem tra cau truc: ls -la ./${NC}"
            exit 1
        fi
    fi

    echo -e "${GREEN}✅ hunyuan3d-2mv/ san sang${NC}"
fi

# Verify cau truc
echo -e "${YELLOW}Verifying hunyuan3d-2mv structure...${NC}"
[ -d "$MV_DIR/hy3dgen" ]                           && echo -e "${GREEN}  ✅ hy3dgen/ (package)${NC}"            || echo -e "${RED}  ❌ hy3dgen/ MISSING${NC}"
[ -d "$MV_DIR/hunyuan3d-dit-v2-mv-fast" ]          && echo -e "${GREEN}  ✅ hunyuan3d-dit-v2-mv-fast/ (shape model)${NC}" || echo -e "${RED}  ❌ hunyuan3d-dit-v2-mv-fast/ MISSING${NC}"
[ -d "$MV_DIR/hunyuan3d-paint-v2-0" ]        && echo -e "${GREEN}  ✅ hunyuan3d-paint-v2-0/ (texture model)${NC}" || echo -e "${RED}  ❌ hunyuan3d-paint-v2-0/ MISSING${NC}"

# ==========================================
# STEP 7: Setup PYTHONPATH cho hunyuan3d-2mv
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[7/10] CONFIGURING PYTHONPATH${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

VENV_ACTIVATE="venv/bin/activate"
MV_ABS_PATH=$(realpath "$MV_DIR")

# Xoa entries cu neu co
sed -i '/# Hunyuan3D/d' "$VENV_ACTIVATE"
sed -i '/export PYTHONPATH.*hunyuan3d/d' "$VENV_ACTIVATE"

# Them path moi — chi can MV_DIR vi hy3dgen la package chuan ben trong
cat >> "$VENV_ACTIVATE" <<EOF

# Hunyuan3D-2mv path (auto-generated by quick_setup.sh)
export PYTHONPATH="${MV_ABS_PATH}:\$PYTHONPATH"
EOF

# Set cho session hien tai
export PYTHONPATH="${MV_ABS_PATH}:$PYTHONPATH"

echo -e "${GREEN}✅ PYTHONPATH set: ${MV_ABS_PATH}${NC}"

# Cau hinh LD_LIBRARY_PATH cho CUDA extensions
if ! grep -q "TORCH_LIB_PATH" "$VENV_ACTIVATE"; then
    cat >> "$VENV_ACTIVATE" <<'EOF'

# PyTorch C++ library path (for CUDA extensions)
TORCH_LIB_PATH=$(python -c "import torch, os; print(os.path.join(os.path.dirname(torch.__file__), 'lib'))" 2>/dev/null)
if [ -n "$TORCH_LIB_PATH" ]; then
    export LD_LIBRARY_PATH="$TORCH_LIB_PATH:$LD_LIBRARY_PATH"
fi
EOF
fi
export LD_LIBRARY_PATH=$(python -c "import torch, os; print(os.path.join(os.path.dirname(torch.__file__), 'lib'))" 2>/dev/null):$LD_LIBRARY_PATH
echo -e "${GREEN}✅ LD_LIBRARY_PATH configured${NC}"

# Verify imports
echo -e "${YELLOW}Verifying hy3dgen imports...${NC}"
python -c "
import sys
sys.path.insert(0, '${MV_ABS_PATH}')

try:
    from hy3dgen.rembg import BackgroundRemover
    print('✅ hy3dgen.rembg OK')
except ImportError as e:
    print(f'❌ hy3dgen.rembg failed: {e}')

try:
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
    print('✅ hy3dgen.shapegen OK')
except ImportError as e:
    print(f'❌ hy3dgen.shapegen failed: {e}')

try:
    from hy3dgen.texgen import Hunyuan3DPaintPipeline
    print('✅ hy3dgen.texgen OK')
except ImportError as e:
    print(f'⚠️  hy3dgen.texgen failed (expected before CUDA compile): {e}')
" || true

# ==========================================
# STEP 8: Compile CUDA modules (hunyuan3d-2mv)
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[8/10] COMPILING CUDA MODULES${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

pip install fake-bpy-module-latest > /dev/null 2>&1
pip install setuptools==69.5.1 > /dev/null 2>&1
echo -e "${GREEN}✅ Build tools ready${NC}"

COMPILED=0

# ── custom_rasterizer: tim trong hy3dgen/texgen/ hoac hy3dpaint/ ──
for RASTER_PATH in \
    "$MV_DIR/hy3dgen/texgen/custom_rasterizer" \
    "$MV_DIR/hy3dpaint/custom_rasterizer"
do
    if [ -d "$RASTER_PATH" ]; then
        echo -e "${YELLOW}Compiling custom_rasterizer ($RASTER_PATH)...${NC}"
        pushd "$RASTER_PATH" > /dev/null
        pip install -e . --no-build-isolation > /tmp/rasterizer_build.log 2>&1 \
            && echo -e "${GREEN}✅ custom_rasterizer compiled${NC}" \
            || echo -e "${RED}❌ Failed! Check /tmp/rasterizer_build.log${NC}"
        popd > /dev/null
        COMPILED=1
        break
    fi
done

# ── DifferentiableRenderer ──
for DR_PATH in \
    "$MV_DIR/hy3dgen/texgen/DifferentiableRenderer" \
    "$MV_DIR/hy3dpaint/DifferentiableRenderer"
do
    if [ -d "$DR_PATH" ]; then
        echo -e "${YELLOW}Compiling DifferentiableRenderer ($DR_PATH)...${NC}"
        pushd "$DR_PATH" > /dev/null
        if [ -f "compile_mesh_painter.sh" ]; then
            bash compile_mesh_painter.sh > /tmp/renderer_build.log 2>&1 \
                && echo -e "${GREEN}✅ DifferentiableRenderer compiled${NC}" \
                || echo -e "${RED}❌ Failed! Check /tmp/renderer_build.log${NC}"
        elif [ -f "setup.py" ]; then
            pip install -e . --no-build-isolation > /tmp/renderer_build.log 2>&1 \
                && echo -e "${GREEN}✅ DifferentiableRenderer compiled${NC}" \
                || echo -e "${RED}❌ Failed! Check /tmp/renderer_build.log${NC}"
        fi
        popd > /dev/null
        COMPILED=1
        break
    fi
done

if [ "$COMPILED" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Khong tim thay CUDA module folders, bo qua compile${NC}"
    echo -e "${YELLOW}   (co the da compiled san trong Drive archive)${NC}"
fi

# Kiem tra RealESRGAN weights
ESRGAN_PATH="$(pwd)/weights/RealESRGAN_x4plus.pth"
if [ -f "$ESRGAN_PATH" ]; then
    echo -e "${GREEN}✅ RealESRGAN_x4plus.pth co san${NC}"
else
    echo -e "${YELLOW}⚠️  RealESRGAN_x4plus.pth khong tim thay${NC}"
    echo -e "${YELLOW}   Download tu GitHub...${NC}"
    mkdir -p "$(pwd)/weights"
    wget -q --show-progress \
        https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth \
        -P "$(pwd)/weights" \
        && echo -e "${GREEN}✅ RealESRGAN downloaded → weights/RealESRGAN_x4plus.pth${NC}" \
        || echo -e "${YELLOW}⚠️  Download that bai — 4K upscale se bi skip${NC}"
fi

# ==========================================
# STEP 9: Create directories
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[9/10] CREATING DIRECTORIES${NC}"
echo -e "${MAGENTA}═══════════════════════════════════════${NC}\n"

mkdir -p utils/upload_temp utils/download utils/models_cache utils/gallery/images utils/gallery/models logs
chmod 755 utils/upload_temp utils/download utils/models_cache utils/gallery/images utils/gallery/models
echo -e "${GREEN}✅ Directories created${NC}"

# ==========================================
# STEP 10: Generate .env + Init database
# ==========================================
echo -e "\n${MAGENTA}═══════════════════════════════════════${NC}"
echo -e "${MAGENTA}[10/10] GENERATING .ENV & INITIALIZING DATABASE${NC}"
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
ALLOWED_ORIGINS=$ALLOWED_ORIGINS

# =========================================
# 🔐 GOOGLE OAUTH
# =========================================
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=$GOOGLE_REDIRECT_URI

# =========================================
# 💳 PAYMENT (OPTIONAL)
# =========================================
SEPAY_API_KEY=
SEPAY_WEBHOOK_SECRET=

# =========================================
# 🤖 HUNYUAN3D MODEL CONFIG
# =========================================
HUNYUAN3D_MODEL_PATH=./hunyuan3d-2mv
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
FRONTEND_URL=$FRONTEND_URL
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=False
LOG_LEVEL=INFO
LOAD_MODEL_ON_STARTUP=True
EOF

echo -e "${GREEN}✅ .env generated${NC}"

# ── Cập nhật frontend-react/.env ──
FRONTEND_ENV_PATH="$(dirname "$(pwd)")/frontend-react/.env"
if [ ! -f "$FRONTEND_ENV_PATH" ]; then
    # Thử tìm trong các vị trí phổ biến
    for TRY_PATH in \
        "../frontend-react/.env" \
        "../../frontend-react/.env" \
        "../frontend/.env"
    do
        if [ -f "$TRY_PATH" ]; then
            FRONTEND_ENV_PATH="$TRY_PATH"
            break
        fi
    done
fi

VITE_API_URL="${EXTERNAL_URL}/api/v1"

if [ -f "$FRONTEND_ENV_PATH" ]; then
    # Cập nhật VITE_API_URL nếu đã tồn tại, không thì append
    if grep -q "^VITE_API_URL=" "$FRONTEND_ENV_PATH"; then
        sed -i "s|^VITE_API_URL=.*|VITE_API_URL=${VITE_API_URL}|" "$FRONTEND_ENV_PATH"
    else
        echo "VITE_API_URL=${VITE_API_URL}" >> "$FRONTEND_ENV_PATH"
    fi
    echo -e "${GREEN}✅ frontend-react/.env updated: VITE_API_URL=${VITE_API_URL}${NC}"
    echo -e "${CYAN}   File: $FRONTEND_ENV_PATH${NC}"
else
    echo -e "${YELLOW}⚠️  Không tìm thấy frontend-react/.env — tạo mới tại ../frontend-react/.env${NC}"
    mkdir -p "$(dirname "../frontend-react/.env")"
    cat > "../frontend-react/.env" <<FRONTEOF
VITE_API_URL=${VITE_API_URL}
VITE_APP_NAME=Hunyuan3D
FRONTEOF
    echo -e "${GREEN}✅ frontend-react/.env created: VITE_API_URL=${VITE_API_URL}${NC}"
fi

# Init database
python -c "
from app.models.base_db import Base, engine
from app.models.user import User
from app.models.task import ModelJob
from app.models.payment import Payment
from app.models.gallery_submission import GallerySubmission
from sqlalchemy.orm import Session

try:
    Base.metadata.create_all(bind=engine)
    print('✅ Tables created: users, model_jobs, payments, gallery_submissions')
except Exception as e:
    print(f'❌ Error: {e}')
    exit(1)

# Seed admin user
try:
    from app.security import hash_password
    with Session(engine) as db:
        exists = db.query(User).filter(User.email == 'admin@gmail.com').first()
        if not exists:
            admin = User(
                name='Admin',
                email='admin@gmail.com',
                password=hash_password('123123'),
                role='admin',
            )
            db.add(admin)
            db.commit()
            print('✅ Admin created: admin@gmail.com / 123123')
        else:
            print('ℹ️  Admin da ton tai, bo qua')
except Exception as e:
    print(f'⚠️  Khong the tao admin: {e}')
"

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
║       🎉 SETUP COMPLETED SUCCESSFULLY! 🎉        ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${CYAN}⏱️  Total time: ${MINUTES}m ${SECS}s${NC}\n"
echo -e "${GREEN}🚀 Khoi dong server:${NC}"
echo ""
echo "  source venv/bin/activate"
echo "  python run_api.py"
echo ""
echo -e "${YELLOW}⚠️  Lan inference dau cham hon (model dang load vao VRAM)${NC}"
echo -e "${CYAN}📄 Credentials: ~/hunyuan3d_setup/${NC}"
echo ""
echo -e "${GREEN}✅ Ready! Chuc mung ban da setup thanh cong Hunyuan3D-2mv! 🎨${NC}"

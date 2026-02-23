#!/bin/bash

# =========================================
# 🚀 ThucTap2026 Installation Script
# =========================================

set -e  # Exit on error

echo "================================================"
echo "🚀 Starting ThucTap2026 Installation..."
echo "================================================"

# =========================================
# 1️⃣ Check System Requirements
# =========================================
echo ""
echo "📋 Checking system requirements..."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.10+"
    exit 1
fi
echo "✅ Python 3 found: $(python3 --version)"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi
echo "✅ Node.js found: $(node --version)"

# Check MySQL
if ! command -v mysql &> /dev/null; then
    echo "⚠️  MySQL not found. Please install MySQL 8.0+"
fi

# =========================================
# 2️⃣ Setup Backend (api_base)
# =========================================
echo ""
echo "================================================"
echo "🐍 Setting up Backend (Python/FastAPI)..."
echo "================================================"

cd api_base

# Create virtual environment
echo "📦 Creating Python virtual environment..."
python3 -m venv venv

# Activate venv
echo "🔌 Activating virtual environment..."
source venv/bin/activate || . venv/Scripts/activate

# Install dependencies
echo "📥 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Create .env if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=hunyuan_user
DATABASE_PASSWORD=changeme
DATABASE_NAME=hunyuan3d_db

SECRET_KEY=dev_secret_key_change_in_production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200

ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback

SEPAY_API_KEY=your_api_key
SEPAY_WEBHOOK_SECRET=your_webhook_secret

HUNYUAN3D_MODEL_PATH=./hunyuan3d-2.1
HUNYUAN3D_DEVICE=cpu

UPLOAD_TEMP_DIR=./utils/upload_temp
DOWNLOAD_DIR=./utils/download
MODELS_CACHE_DIR=./utils/models_cache

API_HOST=0.0.0.0
API_PORT=8000
DEBUG=True
LOG_LEVEL=INFO
EOF
    echo "✅ Created .env file (please update with real values)"
else
    echo "✅ .env file already exists"
fi

# Create directories
echo "📁 Creating storage directories..."
mkdir -p utils/upload_temp
mkdir -p utils/download
mkdir -p utils/models_cache

cd ..

# =========================================
# 3️⃣ Setup Frontend (frontend-react)
# =========================================
echo ""
echo "================================================"
echo "⚛️  Setting up Frontend (React/Vite)..."
echo "================================================"

cd frontend-react

# Install dependencies
echo "📥 Installing Node.js dependencies..."
npm install

# Create .env if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
VITE_API_URL=http://localhost:8000/api/v1
VITE_APP_NAME=Hunyuan3D
VITE_GOOGLE_CLIENT_ID=your-client-id
VITE_ENV=development
VITE_DEBUG=true
EOF
    echo "✅ Created .env file"
else
    echo "✅ .env file already exists"
fi

cd ..

# =========================================
# 4️⃣ Database Setup Instructions
# =========================================
echo ""
echo "================================================"
echo "🗄️  Database Setup Instructions"
echo "================================================"
echo ""
echo "Run these SQL commands in MySQL:"
echo ""
echo "CREATE DATABASE hunyuan3d_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "CREATE USER 'hunyuan_user'@'localhost' IDENTIFIED BY 'your_password';"
echo "GRANT ALL PRIVILEGES ON hunyuan3d_db.* TO 'hunyuan_user'@'localhost';"
echo "FLUSH PRIVILEGES;"
echo ""

# =========================================
# ✅ Installation Complete
# =========================================
echo "================================================"
echo "✅ Installation Complete!"
echo "================================================"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Update api_base/.env with real credentials"
echo "2. Setup MySQL database (see instructions above)"
echo "3. Start Backend:"
echo "   cd api_base"
echo "   source venv/bin/activate  # or venv\\Scripts\\activate on Windows"
echo "   python run_api.py"
echo ""
echo "4. Start Frontend (in another terminal):"
echo "   cd frontend-react"
echo "   npm run dev"
echo ""
echo "🌐 URLs:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "================================================"
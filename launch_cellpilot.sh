#!/usr/bin/env bash
# launch_cellpilot.sh - Improved version that checks prerequisites
set -e

# --- Initialize conda -------------------------------------------
# Source conda configuration
if [ -f "$HOME/miniforge3/etc/profile.d/conda.sh" ]; then
    source "$HOME/miniforge3/etc/profile.d/conda.sh"
elif [ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]; then
    source "$HOME/miniconda3/etc/profile.d/conda.sh"
elif [ -f "$(conda info --base)/etc/profile.d/conda.sh" ]; then
    source "$(conda info --base)/etc/profile.d/conda.sh"
else
    echo "❌ Could not find conda installation!"
    echo "   Please ensure conda is installed and accessible"
    exit 1
fi

# --- Check prerequisites -------------------------------------------
echo "🔍 Checking prerequisites..."

# Check if conda environment exists
if ! conda env list | grep -q "CellPilot-dev"; then
  echo "❌ CellPilot-dev conda environment not found!"
  echo "   Please run: conda env create -f environment.yml"
  exit 1
fi

# Activate the conda environment
echo "🔄 Activating CellPilot-dev environment..."
conda activate CellPilot-dev

# Verify critical dependencies are available
echo "🧪 Checking Python dependencies..."
python -c "
import sys
missing = []
try:
    import omicverse
    print('   ✅ omicverse')
except ImportError:
    missing.append('omicverse')
    print('   ❌ omicverse')
    
try:
    import scanpy
    print('   ✅ scanpy')
except ImportError:
    missing.append('scanpy')
    print('   ❌ scanpy')
    
try:
    import cellphonedb
    print('   ✅ cellphonedb')
except ImportError:
    missing.append('cellphonedb')
    print('   ❌ cellphonedb')
    
try:
    import fastapi
    print('   ✅ fastapi')
except ImportError:
    missing.append('fastapi')
    print('   ❌ fastapi')

if missing:
    print(f'\\n❌ Missing dependencies: {missing}')
    print('   Please check your conda environment setup')
    sys.exit(1)
else:
    print('   ✅ All critical dependencies available')
"

# Check if node_modules exists in my-app
if [ ! -d "my-app/node_modules" ]; then
  echo "⚠️  Frontend dependencies not installed."
  echo "   Installing npm dependencies (this may take a minute)..."
  (cd my-app && npm install)
  echo "✅ Frontend dependencies installed."
fi

# --- Cleanup existing backend on port 8000 ------------------------
echo "🧹 Checking for existing processes on port 8000..."
if lsof -ti :8000 >/dev/null 2>&1; then
  echo "   ⚠️  Found process on port 8000, cleaning up..."
  lsof -ti :8000 | xargs kill -9
  sleep 1  # Give the OS time to free the port
  echo "   ✅ Port 8000 cleared"
else
  echo "   ✅ Port 8000 is available"
fi

# --- Start backend -------------------------------------------------
echo "▶️  Starting API server..."
pushd "$(dirname "$0")/backend" >/dev/null
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload \
  > ../backend.log 2>&1 &
BACKEND_PID=$!
popd >/dev/null

echo "   → Backend running (PID $BACKEND_PID, logs: backend.log)"

# Kill the backend when this script terminates
trap "echo ''; echo '⏹  Stopping backend'; kill $BACKEND_PID" EXIT

# --- Start frontend ------------------------------------------------
echo "▶️  Starting frontend..."
npm start --prefix "$(dirname "$0")/my-app"
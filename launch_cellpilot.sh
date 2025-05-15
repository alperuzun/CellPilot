#!/usr/bin/env bash
# launch_cellpilot.sh - Improved version that checks prerequisites
set -e

# --- Check prerequisites -------------------------------------------
echo "🔍 Checking prerequisites..."

# Check if conda environment exists
if ! conda env list | grep -q "CellPilot-dev"; then
  echo "❌ CellPilot-dev conda environment not found!"
  echo "   Please run: conda env create -f environment.yml"
  exit 1
fi

# Check if node_modules exists in my-app
if [ ! -d "my-app/node_modules" ]; then
  echo "⚠️  Frontend dependencies not installed."
  echo "   Installing npm dependencies (this may take a minute)..."
  (cd my-app && npm install)
  echo "✅ Frontend dependencies installed."
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
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
if ! conda env list | grep -q "CellPilot-dev-311"; then
  echo "❌ CellPilot-dev-311 conda environment not found!"
  echo "   Please run: conda env create -f environment.yml -n CellPilot-dev-311"
  exit 1
fi

# Activate the conda environment
echo "🔄 Activating CellPilot-dev-311 environment..."
conda activate CellPilot-dev-311

# --- Self-heal: install omicverse if missing ----------------------------
# omicverse 1.6.10 declares scipy<1.12 in its metadata, which conflicts
# with anndata 0.12+ (requires scipy>=1.12). At runtime the combination
# works, but pip's resolver refuses both pins together — so omicverse is
# installed here with --no-deps after the conda env exists. Idempotent:
# this block is a no-op once omicverse imports cleanly.
# Probe an actual omicverse submodule so a stray empty namespace dir from a
# prior failed install doesn't make ``import omicverse`` falsely succeed.
if ! python -c "import omicverse.utils" >/dev/null 2>&1; then
  echo "🔧 First-run setup: installing omicverse (this happens once)..."
  # scipy is pinned to the (1.12, 1.14) window — see environment.yml comment.
  # Reaffirming it here because anndata 0.12.x's transitive deps will pull a
  # newer scipy on a fresh install and break statsmodels (which still imports
  # _lazywhere, removed in scipy 1.14).
  pip install -q "scipy>=1.12,<1.14" || {
    echo "❌ Failed to pin scipy."
    exit 1
  }
  pip install -q \
    "scanpy>=1.9" "matplotlib<3.7" "scikit-learn>=1.2" "networkx>=2.8" \
    "multiprocess>=0.70" "datetime>=4.5" "ipywidgets>=8.0" "lifelines>=0.27" \
    "ktplotspy>=0.1" "python-dotplot>=0.0.1" "boltons>=23.0" "ctxcore>=0.2" \
    "termcolor>=2.1" "pygam==0.8.0" "gdown>=4.6" "graphtools>=1.5" \
    "pydeseq2>=0.4.1" "mofax>=0.3" "adjustText>=0.8" "scikit-misc>=0.1" \
    "metatime>=1.3.0" "einops>=0.6" "tensorboard>=2.6" pynvml plotly \
    progressbar2 future traitlets || {
      echo "❌ Failed to install omicverse runtime dependencies."
      exit 1
    }
  # CellOntologyMapper (consensus normalization) requires omicverse >=1.7.1.
  # sentence-transformers is a runtime dep of the mapper that omicverse does
  # not declare in its metadata — it's lazy-imported when the user calls into
  # the mapper, so install it here proactively.
  pip install -q "sentence-transformers>=2.2" || {
    echo "❌ Failed to install sentence-transformers."
    exit 1
  }
  pip install -q --no-deps "omicverse>=1.7.1,<2.0" || {
    echo "❌ Failed to install omicverse."
    exit 1
  }
  # Verify the install actually imports — catches the case where a transitive
  # dep bumped scipy past the statsmodels-compatible window.
  if ! python -c "import omicverse.utils" >/dev/null 2>&1; then
    echo "❌ omicverse installed but failed to import. Run:"
    echo "     conda activate CellPilot-dev-311"
    echo "     python -c 'import omicverse'"
    echo "   to see the underlying ImportError."
    exit 1
  fi
  echo "   ✅ omicverse installed"
fi

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
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES  # Required for PopV (PyTorch/macOS fork safety)
pushd "$(dirname "$0")/backend" >/dev/null
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload \
  2> ../backend_stderr.log &
BACKEND_PID=$!
popd >/dev/null

echo "   → Backend running (PID $BACKEND_PID, logs: backend.log)"

# Kill the backend when this script terminates
trap "echo ''; echo '⏹  Stopping backend'; kill $BACKEND_PID" EXIT

# --- Start frontend ------------------------------------------------
echo "▶️  Starting frontend..."
npm start --prefix "$(dirname "$0")/my-app"
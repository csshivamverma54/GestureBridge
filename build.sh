#!/usr/bin/env bash
# build.sh — Render backend build script
# Runs after `pip install -r backend/requirements.txt`
# Trains the ASL letter classifier from backend/database/asl_data.npz
# and writes the joblib artefacts to backend/models/ at build time.
# This is needed because backend/models/*.joblib are gitignored (large binaries).

set -e   # exit immediately on error
set -o pipefail

echo "=== GestureBridge — build.sh ==="
echo "Python: $(python --version)"
echo "Cwd:    $(pwd)"

# Install Python deps
pip install -r backend/requirements.txt

# Train the ASL letter model (MLP, ~15 s)
echo "--- Training ASL letter model ---"
cd backend
python -m ml.train_asl_letter --model mlp
cd ..
echo "--- Model training done ---"

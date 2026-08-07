#!/usr/bin/env bash
# Freeze the FastAPI backend into a self-contained binary for the AppImage.
#
# The packaged app ships no Python, so PyInstaller bundles the interpreter and
# every dependency into backend/build/pyinstaller/dist/redline-backend/, which
# electron-builder then copies in as an extraResource.
#
# Run via: npm run build:backend   (or npm run dist, which calls this)
set -euo pipefail

cd "$(dirname "$0")/../../backend"

VENV=".venv"
if [ ! -d "$VENV" ]; then
  echo "==> Creating Python virtualenv..."
  python3 -m venv "$VENV"
fi

echo "==> Installing backend dependencies..."
"$VENV/bin/pip" install -q -r requirements.txt

echo "==> Installing PyInstaller..."
"$VENV/bin/pip" install -q pyinstaller

echo "==> Freezing backend..."
# --collect-all pulls in the dynamically imported bits PyInstaller's static
# analysis misses: uvicorn's protocol/loop implementations and psycopg's
# compiled binary driver.
"$VENV/bin/pyinstaller" \
  --noconfirm --clean \
  --name redline-backend \
  --distpath build/pyinstaller/dist \
  --workpath build/pyinstaller/work \
  --specpath build/pyinstaller \
  --collect-all uvicorn \
  --collect-all psycopg \
  --collect-all psycopg_binary \
  --hidden-import app.main \
  --hidden-import app.models \
  --hidden-import app.db \
  --hidden-import app.schemas \
  --hidden-import app.config \
  --paths . \
  desktop_server.py

echo "==> Backend frozen at backend/build/pyinstaller/dist/redline-backend/"

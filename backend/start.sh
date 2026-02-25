#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv
fi

source .venv/bin/activate

echo "Installing dependencies..."
pip install -q -r requirements.txt

echo "Initializing database..."
python scripts/init_db.py

echo "Starting backend on port 8001..."
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

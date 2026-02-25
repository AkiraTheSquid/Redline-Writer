#!/usr/bin/env bash
# Start everything: Postgres (Docker), backend, frontend
set -e
cd "$(dirname "$0")"

echo "==> Starting PostgreSQL container..."
docker compose up -d db

echo "==> Waiting for Postgres to be ready..."
until docker compose exec -T db pg_isready -U postgres -q; do
  sleep 1
done

echo "==> Starting backend..."
bash backend/start.sh &
BACKEND_PID=$!

echo "==> Starting frontend..."
bash frontend/start.sh &
FRONTEND_PID=$!

echo ""
echo "Redline Writer is running:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8001"
echo ""
echo "Press Ctrl+C to stop everything."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker compose stop db" INT TERM
wait

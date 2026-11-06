#!/bin/bash
# Developer start script (macOS/Linux). Backend uses SQLite unless DATABASE_URL points at PostgreSQL.
# Windows: use start_dev.ps1
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "== Backend =="
cd "$ROOT/backend"
[ -d venv ] || python3 -m venv venv
. venv/bin/activate
pip install -r requirements.txt -q
[ -f .env ] || { cp .env.example .env; echo "Created backend/.env from .env.example (edit keys to enable AI/voice)."; }
if grep -q "^DATABASE_URL=postgresql" .env; then
  echo "PostgreSQL configured — starting container and running migrations"
  (docker compose -f "$ROOT/docker-compose.yml" up -d || docker-compose -f "$ROOT/docker-compose.yml" up -d)
  alembic upgrade head
fi
uvicorn main:app --reload --host 127.0.0.1 --port 8002 &
BACK=$!

echo "== Frontend =="
cd "$ROOT/frontend"
[ -d node_modules ] || npm install --no-audit --no-fund
npm run dev &
FRONT=$!

echo "
Frontend: http://localhost:5173
Backend:  http://localhost:8002  (docs at /docs when ENABLE_DOCS=true)
Press Ctrl+C to stop both."
trap "kill $BACK $FRONT 2>/dev/null" EXIT
wait

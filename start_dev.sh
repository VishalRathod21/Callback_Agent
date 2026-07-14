#!/bin/bash
export COQUI_TOS_AGREED=1

echo "Cleaning up any stale processes on ports 8002, 5173, and 5174..."
PORT_8002_PIDS=$(lsof -t -i:8002)
if [ -n "$PORT_8002_PIDS" ]; then
  kill -9 $PORT_8002_PIDS 2>/dev/null
fi
PORT_5173_PIDS=$(lsof -t -i:5173)
if [ -n "$PORT_5173_PIDS" ]; then
  kill -9 $PORT_5173_PIDS 2>/dev/null
fi
PORT_5174_PIDS=$(lsof -t -i:5174)
if [ -n "$PORT_5174_PIDS" ]; then
  kill -9 $PORT_5174_PIDS 2>/dev/null
fi
pkill -f "uvicorn main:app" 2>/dev/null
pkill -f "node.*vite" 2>/dev/null

echo "Starting PostgreSQL..."
docker-compose up -d


echo "Setting up Python environment..."
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

echo "Running DB migrations..."
alembic upgrade head

echo "Starting FastAPI backend..."
uvicorn main:app --reload --host 0.0.0.0 --port 8002 &

echo "Waiting for backend to be ready (ML models can take ~60s to load)..."
MAX_WAIT=120
ELAPSED=0
until curl -sf http://localhost:8002/health > /dev/null 2>&1; do
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "WARNING: Backend did not respond within ${MAX_WAIT}s — starting frontend anyway."
    break
  fi
  printf "."
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done
echo ""
echo "Backend is ready!"

echo "Starting React frontend..."
cd ../frontend
npm install
npm run dev &

echo "
InterviewAI is running!
Frontend: http://localhost:5173
Backend:  http://localhost:8002
API Docs: http://localhost:8002/docs
"

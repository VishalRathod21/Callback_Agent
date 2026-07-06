#!/bin/bash
echo "Stopping InterviewAI services..."

# Find and kill backend running on port 8002
PORT_8002_PIDS=$(lsof -t -i:8002)
if [ -n "$PORT_8002_PIDS" ]; then
  echo "Killing processes on port 8002..."
  kill -9 $PORT_8002_PIDS 2>/dev/null
fi

# Find and kill frontend running on port 5173
PORT_5173_PIDS=$(lsof -t -i:5173)
if [ -n "$PORT_5173_PIDS" ]; then
  echo "Killing processes on port 5173..."
  kill -9 $PORT_5173_PIDS 2>/dev/null
fi

# Find and kill frontend running on port 5174
PORT_5174_PIDS=$(lsof -t -i:5174)
if [ -n "$PORT_5174_PIDS" ]; then
  echo "Killing processes on port 5174..."
  kill -9 $PORT_5174_PIDS 2>/dev/null
fi

# Also stop uvicorn and vite processes specifically
echo "Ensuring all uvicorn and vite processes are stopped..."
pkill -f "uvicorn main:app" 2>/dev/null
pkill -f "node.*vite" 2>/dev/null

# Stop docker-compose
echo "Stopping database containers..."
docker-compose down

echo "All services stopped successfully."

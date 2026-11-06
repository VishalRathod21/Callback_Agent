#!/bin/bash
# Stops dev servers started by start_dev.sh (macOS/Linux).
pkill -f "uvicorn main:app" 2>/dev/null && echo "backend stopped"
pkill -f "vite" 2>/dev/null && echo "frontend stopped"
exit 0

#!/bin/bash

# Start both frontend and backend servers

DIR="$(cd "$(dirname "$0")" && pwd)"

# Locate the venv Python (Scripts on Windows, bin on Unix/WSL)
if [ -f "$DIR/backend/venv/Scripts/python.exe" ]; then
  VENV_PYTHON="$DIR/backend/venv/Scripts/python.exe"
elif [ -f "$DIR/backend/venv/bin/python" ]; then
  VENV_PYTHON="$DIR/backend/venv/bin/python"
else
  echo "Error: venv not found. Run 'bash setup.sh' first."
  exit 1
fi

echo "Starting backend (FastAPI)..."
cd "$DIR/backend"
"$VENV_PYTHON" -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

echo "Starting frontend (Vite)..."
cd "$DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Backend running on http://localhost:8000"
echo "Frontend running on http://localhost:5173"
echo "Press Ctrl+C to stop both servers."

# Trap Ctrl+C to kill both processes
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

# Wait for both
wait

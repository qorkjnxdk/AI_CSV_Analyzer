# Setup Guide

## Clone the Repository

```bash
git clone https://github.com/qorkjnxdk/AI_CSV_Anaylzer.git
cd AI_CSV_Anaylzer
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- An OpenAI API key

## Initial Setup (One-Time)

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # On Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Frontend

```bash
cd frontend
npm install
```

### 3. Environment Variables

Create a `.env` file in the project root:

```
OPENAI_API_KEY=sk-proj-your-key-here
OPENAI_MODEL=gpt-4o
```

## Running the Application

After completing the initial setup, start both servers with:

```bash
bash start.sh
```

This launches the backend and frontend in parallel:
- Backend API: `http://localhost:8000`
- Frontend UI: `http://localhost:5173`

Press `Ctrl+C` to stop both servers.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key | (required) |
| `OPENAI_MODEL` | Model to use for code generation | `gpt-4o` |

## Architecture

```
frontend/          React 19 + TypeScript + Tailwind CSS v4 (Vite)
backend/           FastAPI + Python 3.11+
├── routers/       upload.py, query.py, history.py
├── services/      file_service.py, query_service.py, sandbox.py
├── security/      injection_guard.py, magic_bytes.py, audit_logger.py
└── session/       session_store.py (in-memory dataframe registry)
```

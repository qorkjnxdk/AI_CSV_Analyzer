# AI-Powered CSV / Excel Analysis Application

A full-stack web application that allows users to upload CSV/Excel files and ask natural language questions about their data. Built with React + TypeScript (frontend) and FastAPI + Python (backend), powered by OpenAI GPT-4o.

## Features

- **Multi-file upload** — Upload one or more CSV, XLS, or XLSX files per session
- **Data preview** — View the top N rows of any uploaded file/sheet with adjustable row count
- **Natural language Q&A** — Ask questions about your data in plain English; the AI generates and executes pandas code
- **Chart generation** — Request visualizations (bar, line, scatter, histogram, pie) rendered inline
- **Prompt history** — Browse and re-use past prompts from the sidebar
- **Feedback system** — Rate AI responses with thumbs up/down; view feedback summary

## Architecture

```
frontend/          React + TypeScript + Tailwind CSS (Vite)
backend/           FastAPI + Python 3.11+
├── routers/       upload.py, query.py, history.py
├── services/      file_service.py, query_service.py, sandbox.py
├── security/      injection_guard.py, magic_bytes.py, audit_logger.py
└── session/       session_store.py (in-memory dataframe registry)
```

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- An OpenAI API key

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # On Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Create .env from template
cp ../.env.example .env
# Edit .env and add your OpenAI API key

uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173` and the backend API at `http://localhost:8000`.

## Security Considerations

This application implements security as a first-class concern:

| Feature | Attack Mitigated | Implementation |
|---|---|---|
| **API key protection** | Key theft via Git history | Key stored in `.env`, excluded via `.gitignore` |
| **Magic byte validation** | Malicious file disguised as CSV | `python-magic` reads file header bytes to verify true MIME type |
| **Sandboxed code execution** | LLM-generated code executing system commands | `exec()` runs with restricted globals — only pandas/numpy/matplotlib allowed; `os`, `subprocess`, `open`, `__import__` are blocked |
| **Prompt injection detection** | User manipulating LLM context | Input scanned for known injection patterns before being sent to OpenAI |
| **Audit logging** | Undetected abuse | Every upload and query logged with timestamp, session ID, and hash — no raw user data in logs |
| **In-memory file handling** | Sensitive data persisting on disk | All files parsed into pandas DataFrames via `BytesIO`; no temp files written |

### Sandboxed Execution Detail

The most significant security risk is executing LLM-generated code. The sandbox:
- Constructs a restricted globals dict with only `df`, `pd`, `np`, `plt`, `sns`, and `BytesIO`
- Removes all Python builtins except a safe whitelist (`len`, `range`, `str`, `int`, `float`, `list`, `dict`, `sum`, `min`, `max`, `round`, `print`, etc.)
- Catches and surfaces all exceptions as user-facing errors
- Prevents file system access, subprocess spawning, network calls, and arbitrary imports

### Prompt Injection Detection

User queries are scanned for instruction overrides, context extraction attempts, and role manipulation patterns. Flagged queries are rejected with HTTP 400 and logged in the audit trail.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key | (required) |
| `OPENAI_MODEL` | Model to use for code generation | `gpt-4o` |

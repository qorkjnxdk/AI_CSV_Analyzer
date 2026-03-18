from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import upload, query, history
from session.session_store import cleanup_expired_sessions

import asyncio

app = FastAPI(title="AI CSV/Excel Analyzer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api")
app.include_router(query.router, prefix="/api")
app.include_router(history.router, prefix="/api")


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(session_cleanup_loop())


async def session_cleanup_loop():
    while True:
        cleanup_expired_sessions()
        await asyncio.sleep(300)


@app.get("/api/health")
async def health():
    return {"status": "ok"}

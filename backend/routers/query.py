from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone

from session.session_store import get_session
from services.query_service import ask_openai
from services.sandbox import execute_sandboxed
from security.injection_guard import check_injection
from security.audit_logger import log_query, log_injection_attempt

router = APIRouter(tags=["query"])


class QueryRequest(BaseModel):
    question: str
    filename: str
    sheet: str = "Sheet1"
    save_history: bool = True


@router.post("/query")
async def query_data(
    req: QueryRequest,
    x_session_id: str = Header(...),
):
    session = get_session(x_session_id)
    if session is None:
        raise HTTPException(404, "Session not found")

    # Prompt injection check
    is_safe, matched = check_injection(req.question)
    if not is_safe:
        log_injection_attempt(x_session_id, req.question, matched or "")
        raise HTTPException(
            400,
            f"Query rejected: potential prompt injection detected."
        )

    # Retrieve dataframe
    file_sheets = session["files"].get(req.filename)
    if file_sheets is None:
        raise HTTPException(404, f"File '{req.filename}' not found")

    df = file_sheets.get(req.sheet)
    if df is None:
        raise HTTPException(404, f"Sheet '{req.sheet}' not found")

    log_query(x_session_id, req.question)
    import logging
    logging.getLogger("uvicorn.error").info("[QUERY] question=%s, file=%s", req.question, req.filename)

    # Get code from OpenAI
    try:
        llm_response = await ask_openai(df, req.question)
    except Exception as e:
        raise HTTPException(502, f"OpenAI API error: {type(e).__name__}: {e}")

    # If the LLM returned a text response (not code), return it directly
    if llm_response["type"] == "text":
        result = {"type": "text", "data": llm_response["data"]}
    else:
        result = execute_sandboxed(llm_response["data"], df)

    # Store in history (skip for replays and errors)
    if req.save_history and result.get("type") != "error":
        history_entry = {
            "question": req.question,
            "filename": req.filename,
            "sheet": req.sheet,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "result": result,
        }
        session["history"].append(history_entry)
        result["history_index"] = len(session["history"]) - 1

    return result

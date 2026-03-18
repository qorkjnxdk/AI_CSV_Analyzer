from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from session.session_store import get_session

router = APIRouter(tags=["history"])


@router.get("/history")
async def get_history(x_session_id: str = Header(...)):
    session = get_session(x_session_id)
    if session is None:
        raise HTTPException(404, "Session not found")

    # Attach feedback ratings to history entries
    history = session["history"]
    feedback = session["feedback"]
    enriched = []
    for i, entry in enumerate(history):
        e = {**entry, "rating": feedback.get(str(i))}
        enriched.append(e)

    return {"history": enriched}


class FeedbackRequest(BaseModel):
    history_index: int
    rating: int  # 1-5


@router.post("/feedback")
async def submit_feedback(
    req: FeedbackRequest,
    x_session_id: str = Header(...),
):
    session = get_session(x_session_id)
    if session is None:
        raise HTTPException(404, "Session not found")

    if req.rating < 1 or req.rating > 5:
        raise HTTPException(400, "Rating must be between 1 and 5")

    if req.history_index < 0 or req.history_index >= len(session["history"]):
        raise HTTPException(400, "Invalid history index")

    session["feedback"][str(req.history_index)] = req.rating

    # Calculate summary
    feedback = session["feedback"]
    total = len(feedback)
    avg = round(sum(feedback.values()) / total, 1) if total > 0 else 0

    return {
        "success": True,
        "summary": {"total": total, "average_rating": avg},
    }


@router.get("/feedback/summary")
async def feedback_summary(x_session_id: str = Header(...)):
    session = get_session(x_session_id)
    if session is None:
        raise HTTPException(404, "Session not found")

    feedback = session["feedback"]
    total = len(feedback)
    avg = round(sum(feedback.values()) / total, 1) if total > 0 else 0

    return {"total": total, "average_rating": avg}

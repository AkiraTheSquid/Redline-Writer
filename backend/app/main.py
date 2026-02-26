from datetime import datetime, timezone
from uuid import UUID

from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession

from .db import get_db
from .models import Session
from .schemas import SessionCreate, SessionPatch, SessionEnd, SessionOut

app = FastAPI(title="Redline Writer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/sessions", response_model=SessionOut, status_code=201)
def create_session(body: SessionCreate, db: DBSession = Depends(get_db)):
    session = Session(
        duration_min=body.duration_min,
        min_wpm=body.min_wpm,
        reminder_interval_min=body.reminder_interval_min,
        organizer_text=body.organizer_text,
        outcome=body.outcome,
        title=body.title,
        content=body.content,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@app.patch("/sessions/{session_id}", response_model=SessionOut)
def patch_session(
    session_id: UUID, body: SessionPatch, db: DBSession = Depends(get_db)
):
    session = db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(session, field, value)

    db.commit()
    db.refresh(session)
    return session


@app.post("/sessions/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: UUID, body: SessionEnd, db: DBSession = Depends(get_db)
):
    session = db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.outcome = body.outcome
    session.content = body.content
    session.organizer_text = body.organizer_text
    session.word_count = body.word_count
    session.wpm_at_end = body.wpm_at_end
    session.elapsed_sec = body.elapsed_sec
    session.completed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(session)
    return session


@app.get("/sessions", response_model=list[SessionOut])
def list_sessions(db: DBSession = Depends(get_db)):
    return (
        db.query(Session)
        .filter(Session.outcome.in_(["draft", "active", "completed"]))
        .order_by(Session.created_at.desc())
        .all()
    )


@app.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: UUID, db: DBSession = Depends(get_db)):
    session = db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: UUID, db: DBSession = Depends(get_db)):
    session = db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return Response(status_code=204)

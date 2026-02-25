from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class SessionCreate(BaseModel):
    duration_min: int = 20
    min_wpm: int = 10
    reminder_interval_min: int = 0
    organizer_text: str = ""
    outcome: str = "active"
    title: str = ""
    content: str = ""


class SessionPatch(BaseModel):
    content: str | None = None
    organizer_text: str | None = None
    word_count: int | None = None
    wpm_at_end: float | None = None
    elapsed_sec: int | None = None
    title: str | None = None
    outcome: str | None = None
    duration_min: int | None = None
    min_wpm: int | None = None


class SessionEnd(BaseModel):
    outcome: str  # 'completed' | 'deleted_inactivity' | 'deleted_wpm' | 'abandoned'
    content: str = ""
    organizer_text: str = ""
    word_count: int = 0
    wpm_at_end: float = 0.0
    elapsed_sec: int = 0


class SessionOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    created_at: datetime
    completed_at: datetime | None
    duration_min: int
    min_wpm: int
    reminder_interval_min: int
    organizer_text: str
    content: str
    word_count: int
    wpm_at_end: float
    elapsed_sec: int
    outcome: str
    title: str

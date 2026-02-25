from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
import uuid

from .db import Base


def now_utc():
    return datetime.now(timezone.utc)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Setup parameters
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    min_wpm: Mapped[int] = mapped_column(Integer, nullable=False)
    reminder_interval_min: Mapped[int] = mapped_column(Integer, default=0)
    organizer_text: Mapped[str] = mapped_column(Text, default="")

    # Session content (autosaved)
    content: Mapped[str] = mapped_column(Text, default="")
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    wpm_at_end: Mapped[float] = mapped_column(Float, default=0.0)
    elapsed_sec: Mapped[int] = mapped_column(Integer, default=0)

    # Outcome: 'active', 'completed', 'deleted_inactivity', 'deleted_wpm', 'abandoned'
    outcome: Mapped[str] = mapped_column(String(32), default="active")

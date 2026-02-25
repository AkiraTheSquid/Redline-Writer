"""Create tables and apply any missing column additions."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from app.db import engine, Base
import app.models  # noqa: F401 — ensures models are registered


def main():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)

    # Add columns that may be missing from pre-existing tables
    migrations = [
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            conn.execute(text(sql))
        conn.commit()

    print("Done.")


if __name__ == "__main__":
    main()

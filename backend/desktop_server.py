"""
Entry point for the frozen backend binary shipped inside the AppImage.

The packaged desktop app has no Python interpreter, no venv and no source tree,
so this replaces `start.sh` (init_db.py + uvicorn) with a single executable.

Configuration arrives entirely through the environment, set by the Electron main
process — there is no .env beside a frozen binary:

    DATABASE_URL        required, points at the local Postgres
    REDLINE_DIST_DIR    where app.main mounts the built UI from
    REDLINE_PORT        defaults to 8001
    REDLINE_HOST        defaults to 127.0.0.1 (loopback only)
"""

import multiprocessing
import os
import sys


def ensure_schema():
    """Create tables and apply additive column migrations. Idempotent.

    Mirrors scripts/init_db.py, which the packaged app cannot run as a script.
    """
    from sqlalchemy import text

    from app.db import Base, engine
    import app.models  # noqa: F401 — registers the models on Base

    Base.metadata.create_all(bind=engine)

    migrations = [
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT ''",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            conn.execute(text(sql))
        conn.commit()


def main():
    if not os.environ.get("DATABASE_URL"):
        sys.exit("DATABASE_URL is not set — the desktop shell should provide it.")

    try:
        ensure_schema()
    except Exception as exc:
        sys.exit(f"Could not prepare the database schema: {exc}")

    import uvicorn

    from app.main import app

    # Pass the app object, not an import string: a frozen binary cannot re-import
    # itself by module path the way uvicorn's reloader expects.
    uvicorn.run(
        app,
        host=os.environ.get("REDLINE_HOST", "127.0.0.1"),
        port=int(os.environ.get("REDLINE_PORT", "8001")),
        log_level="info",
    )


if __name__ == "__main__":
    # Required before any threads start, or a frozen binary re-executes itself.
    multiprocessing.freeze_support()
    main()

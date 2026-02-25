# Redline Writer — AI Handoff Document

## What This App Is

A port of an AutoHotkey "write or die" writing app (`/home/stellar-thread/Old Windows Files/file transition/ActiveScripts copy for Malissa/Utilities/Fast writing app/fast_write.ahk`) to a local web app.

**Core mechanic:** You set a duration and minimum WPM. If you stop typing for 10 seconds, OR if your WPM drops below the minimum (enforced after 60 seconds), **everything you wrote is deleted** and the session ends. This forces you to write continuously.

---

## Tech Stack

- **Frontend:** React 18 + Vite (port 5173)
- **Backend:** Python FastAPI + SQLAlchemy + psycopg (port 8001)
- **Database:** PostgreSQL 17 running in Docker (port 54330, database name `redline_writer`)
- **Architecture goal:** Kept frontend/backend loosely coupled so it can later be wrapped in Tauri as a desktop app for Linux.

---

## Directory Structure

```
/home/stellar-thread/Applications/Redline-Writer-Local/
├── docker-compose.yml          # Postgres 17 container on port 54330
├── start.sh                    # Starts DB + backend + frontend
├── HANDOFF.md                  # This file
│
├── backend/
│   ├── .venv/                  # Python venv (already created & installed)
│   ├── .env                    # DATABASE_URL + STORAGE_DIR
│   ├── .env.example
│   ├── requirements.txt
│   ├── start.sh                # Activates venv, runs init_db, starts uvicorn
│   ├── scripts/
│   │   └── init_db.py          # Creates DB tables (already run successfully)
│   └── app/
│       ├── __init__.py
│       ├── config.py           # Pydantic settings from .env
│       ├── db.py               # SQLAlchemy engine + SessionLocal + Base
│       ├── models.py           # Session ORM model
│       ├── schemas.py          # Pydantic request/response schemas
│       └── main.py             # FastAPI routes
│
└── frontend/
    ├── node_modules/           # NOT YET INSTALLED — npm install was interrupted
    ├── package.json
    ├── vite.config.js          # Proxies /sessions and /health to localhost:8001
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx             # Top-level router: setup -> writing -> history
        ├── api.js              # Thin fetch wrapper for all API calls
        ├── index.css
        └── components/
            ├── SetupScreen.jsx     # Session config form
            ├── WritingScreen.jsx   # The actual writing UI (most complex)
            └── SessionHistory.jsx  # Past sessions list with expandable content
```

---

## Current Status

### What's working:
- ✅ Docker Postgres container running on port 54330
- ✅ Python venv created at `backend/.venv/`, all deps installed
- ✅ Database tables created (`sessions` table exists)
- ✅ Backend running on port 8001 — tested with curl, works perfectly
- ✅ Session creation endpoint tested: `POST /sessions` returns correct JSON
- ✅ All backend files written (config, models, schemas, routes)
- ✅ All frontend files written (App, SetupScreen, WritingScreen, SessionHistory)

### What's NOT done yet:
- ❌ `npm install` was interrupted — frontend node_modules not installed
- ❌ Frontend has never been started or tested in browser
- ❌ No end-to-end testing done (session create → write → autosave → end)
- ❌ The backend uvicorn process started in the session may or may not still be running

---

## How to Start Everything From Scratch

```bash
# 1. Start Postgres
cd /home/stellar-thread/Applications/Redline-Writer-Local
docker compose up -d db

# 2. Wait a few seconds, then start backend
cd backend
source .venv/bin/activate
python scripts/init_db.py   # safe to run multiple times (idempotent)
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# 3. In another terminal, start frontend
cd /home/stellar-thread/Applications/Redline-Writer-Local/frontend
npm install     # must do this first if node_modules missing
npm run dev

# 4. Open browser at http://localhost:5173
```

Or just run `bash start.sh` from the root directory which does all of the above.

---

## Database

**Connection string:** `postgresql+psycopg://postgres:postgres@localhost:54330/redline_writer`

### `sessions` table schema:
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK, auto-generated |
| created_at | timestamptz | auto |
| completed_at | timestamptz | null until ended |
| duration_min | integer | planned session length |
| min_wpm | integer | minimum words per minute |
| reminder_interval_min | integer | post-timer beep interval (0 = off) |
| organizer_text | text | notes/outline panel content |
| content | text | main writing (empty if deleted) |
| word_count | integer | words at end |
| wpm_at_end | float | WPM when session ended |
| elapsed_sec | integer | actual seconds elapsed |
| outcome | varchar(32) | 'active', 'completed', 'deleted_inactivity', 'deleted_wpm', 'abandoned' |

---

## API Endpoints (all working)

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /sessions | Create new session |
| PATCH | /sessions/{id} | Autosave content mid-session |
| POST | /sessions/{id}/end | End session with outcome |
| GET | /sessions | List all non-active sessions |
| GET | /sessions/{id} | Get one session |

---

## Writing Session Logic (WritingScreen.jsx)

This is the core of the app. Key behaviors implemented:

### Timer
- Counts down from `duration_min * 60` seconds
- After hitting 0: switches to post-timer mode, shows `+MM:SS` counting up
- Beeps once at timer end

### WPM Calculation (every second via setInterval)
```
elapsedSec = (Date.now() - startTime) / 1000
netWords = countWords(currentText) - baselineWords  (baseline = 0, content starts empty)
currentWPM = Math.round((netWords * 60) / elapsedSec)
```

### Inactivity Deletion
- Tracks `lastCharCount` each second
- If char count hasn't changed: increment `inactivitySec`
- At 7-9 seconds inactivity: beep warning (Web Audio API)
- At 10 seconds: call `endSession('deleted_inactivity')` → clears textarea, saves empty content to DB

### WPM Enforcement
- Only kicks in after 60 seconds elapsed
- If `currentWPM < min_wpm`: call `endSession('deleted_wpm')` → same as above

### Sidebar Color
- Left and right padding columns change color based on WPM proximity to minimum
- 10-step gradient: `#FF0000` (at/below minWPM) → `#FFFFFF` (10+ WPM above minWPM)
- Uses CSS transition for smooth color change

### Key Blocking (browser-level, not OS-level)
- Tab, Delete, Insert, Home, End, PageUp, PageDown, F1-F12 blocked
- Ctrl+C and Ctrl+V blocked
- Note: OS-level keys (Alt+Tab, Win key) cannot be blocked in a browser

### Autosave
- Every 2 ticks (2 seconds): PATCH `/sessions/{id}` with current content, word count, WPM, elapsed

### Layout (4-column, matching original AHK app)
- Left pad (260px, colored)
- Organizer textarea (340px, editable notes panel)
- Main editor (flex: 1, fills remaining space)
- Right pad (260px, colored)

---

## Reference: Original AHK Script

Location: `/home/stellar-thread/Old Windows Files/file transition/ActiveScripts copy for Malissa/Utilities/Fast writing app/fast_write.ahk`

The original also had:
- AI feedback on session close: ran a Python script (`ai_prompt_setup.py`) that built a prompt from a template + written content and called OpenAI, then showed the result in a window
- This feature has NOT been ported yet — could be added as a `POST /sessions/{id}/feedback` endpoint that calls an AI API

---

## Known Issues / Next Steps

1. **Run `npm install` in `frontend/`** — this is the immediate blocker for testing the frontend
2. **Test the full flow in browser** — SetupScreen → WritingScreen → end → SessionHistory
3. **Check if backend is still running** — the uvicorn process was started in the prior session; check with `lsof -i :8001` or just restart it
4. **Potential React StrictMode double-effect issue** — `WritingScreen` creates a DB session in a `useEffect`. In dev mode, React StrictMode runs effects twice. The session creation will fire twice, creating a duplicate session. Fix: move session creation out of StrictMode, or remove `<React.StrictMode>` from `main.jsx` during development.
5. **The `version` key in docker-compose.yml** is deprecated and shows a warning — harmless, but can be removed.
6. **AI feedback feature** from original AHK app not yet ported.
7. **No way to copy content out of a completed session** — SessionHistory shows content but no copy button yet.

---

## User Preferences / Context

- This user has another app at `/home/stellar-thread/Applications/pdf-split-tool` that uses the same FastAPI + PostgreSQL (via Docker/Supabase on port 54322) pattern — that's the reference architecture that was followed here.
- There is also `/home/stellar-thread/Applications/Redline-Writer-Deployed` directory (do NOT create anything there — it's for a future Supabase/Vercel deployed version).
- The goal is: local version now → later wrap with Tauri for Linux desktop app → later create a deployed version with Supabase.

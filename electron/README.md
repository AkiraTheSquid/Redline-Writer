# electron/ — Redline Writer desktop shell

Wraps the existing local stack in a desktop window. No sign-in, no network, no cloud.

```
Postgres 17 (Docker, :54330)  →  FastAPI (:8001)  →  React UI  →  Electron window
```

## Run it

```bash
cd electron
npm install          # once

npm run desktop      # build the UI, then launch the desktop app  ← normal use
npm run start:prod   # launch against an existing frontend/dist build
npm run start        # dev mode: attaches to the Vite server on :5173
```

`npm run desktop` is the one to use day to day. It rebuilds `frontend/dist` and boots
everything else on demand.

## What boot does

`main.js` walks the stack bottom-up, and **reuses anything already running** — it never
restarts or kills a process it did not start. Launching the desktop app while `start.sh`
is up in a terminal is safe.

1. **Database** — `docker compose up -d db` unless :54330 already answers, then waits for it.
2. **Backend** — runs `scripts/init_db.py` (idempotent) and spawns `uvicorn` unless :8001
   already answers, then waits for `/health`.
3. **Frontend** — prod: requires `frontend/dist`; dev: requires the Vite server on :5173.
4. Loads the app and closes the splash.

Any failed step shows a dialog naming the fix rather than a blank window. On quit, only
processes this shell spawned get `SIGTERM`.

## Why the backend serves the UI

In prod the window loads `http://127.0.0.1:8001`, not a `file://` path. `backend/app/main.py`
mounts `frontend/dist` at `/` (last, so every API route is matched first). One origin means
the UI's relative `fetch("/sessions")` calls in `frontend/src/api.js` work unchanged, with no
CORS and no `file://` asset-path problems. The mount is skipped when `dist` does not exist,
so plain `uvicorn` dev use is unaffected.

## No sign-in — how that is enforced

`frontend/src/lib/supabase.js` builds a client only when `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are present at build time; otherwise it exports `null`, and
`App.jsx` sets `AUTH_ENABLED = !!supabase` → `false`, so `AuthScreen` never renders.

**Do not add a `frontend/.env` with those keys.** Doing so would turn auth back on and point
writing at hosted Supabase instead of local Postgres. There is no such file today.

## Data

Everything lives in the Docker volume `redline_pgdata`, table `sessions`. Nothing is stored
as markdown or loose files — `STORAGE_DIR` in `backend/app/config.py` is declared but unused.

## Files

| File | Role |
|---|---|
| `main.js` | Boot orchestration, window lifecycle, process cleanup |
| `preload.js` | `contextIsolation` bridge; exposes only `window.redline` metadata |
| `splash.html` | Boot-progress window, replaced by the app window |
| `package.json` | Electron dep + run scripts |

Deliberately kept out of the repo root: a root `package.json` would make Vercel install
Electron during the deployed build (`vercel.json` builds `frontend/` only).

## Not done yet

Packaging to a distributable AppImage. That needs `electron-builder` plus a decision on
whether to bundle Postgres and Python or require them on the target machine — currently
both must already exist locally.

## Recent Changes

- **2026-08-07** — Created. Electron shell, splash, backend static mount for `frontend/dist`,
  `electron/node_modules` + `electron/dist` gitignored.

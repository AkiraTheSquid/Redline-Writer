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

## Installing it as a real desktop app

```bash
cd electron
npm run app      # build + package + install into the applications menu
```

That is the whole thing: "Redline Writer" appears in the applications menu with the
looping-line icon, launches on click, and needs no terminal. Everything lands under
`~/.local`, so no root:

| What | Where |
|---|---|
| Binary | `~/.local/bin/redline-writer.AppImage` |
| Launcher | `~/.local/share/applications/redline-writer.desktop` |
| Icons | `~/.local/share/icons/hicolor/{128,256,512,1024}x*/apps/` + `scalable/` |

The AppImage is **copied** to `~/.local/bin` rather than symlinked, so rebuilding
`electron/dist/` never breaks the installed launcher. Re-run `npm run app` to update it.

### Changing the icon

`build/icon.svg` is the source. After replacing it:

```bash
npm run render:icon    # icon.svg -> icon.png (1024px master)
npm run app            # repackage + reinstall
```

**Never let ImageMagick read the SVG.** `convert` has no librsvg delegate on this machine, so
it falls back to its internal MSVG renderer, which ignores the icon's `clipPath` and produces
an inverted white square with the artwork missing — and exits 0, so it looks like it worked.
`scripts/render-icon.sh` uses cairosvg instead; everything downstream resizes the PNG master,
which ImageMagick handles fine. The `scalable` icon entry ships the SVG as-is because GTK
renders it through librsvg, which is correct.

### The window is cleared of cache on every launch

`main.js` calls `session.defaultSession.clearCache()` before loading the UI. The app is
served from localhost, so the cache saves nothing — but it does let a rebuilt frontend come
up as the **previous** version: Electron replays the cached `index.html`, which points at
asset hashes that no longer exist. The symptom is an update that appears to have silently
done nothing. Do not remove this call without another cache-busting scheme.

### StartupWMClass is easy to get wrong

The desktop entry sets `StartupWMClass=redline-writer-desktop`. Electron takes the window's
`WM_CLASS` from package.json **`name`**, not `productName` — so the obvious guess
("Redline Writer") is wrong, and the symptom is subtle: the app still launches, but the
running window shows a generic icon and will not group with or pin to the launcher.
Check with `xprop WM_CLASS` after any rename.

## Packaging an AppImage

```bash
cd electron
npm run dist     # build UI -> freeze backend -> electron-builder
```

Output: `electron/dist/RedlineWriter-0.1.0-x86_64.AppImage` (~140 MB). Runs from anywhere,
no install step.

**Python is bundled, Postgres is not.** `scripts/build-backend.sh` freezes the FastAPI app
with PyInstaller into a standalone binary (`backend/desktop_server.py` is its entry point),
so the target machine needs no Python, no venv and no `pip install`. It still needs **Docker**
running, because the AppImage starts the same Postgres 17 container the dev stack uses.

Three things ship as `extraResources`, unpacked beside the asar rather than inside it —
neither a frozen binary nor Python's `StaticFiles` can read from an asar archive:

| Resource | Why |
|---|---|
| `backend/redline-backend/` | The frozen API server |
| `frontend-dist/` | The built UI, which the backend serves |
| `docker-compose.yml` | Used to start the database container |

### The compose project name matters

`main.js` pins `COMPOSE_PROJECT = "redline-writer-local"`. Docker derives the volume name
from the project, so the AppImage attaches to the existing `redline-writer-local_redline_pgdata`
volume and opens your real drafts. **Changing that string would silently create a second,
empty database** rather than fail — the app would look like it had lost every session.

### Config reaches the frozen backend by environment

There is no `.env` beside a packaged binary, so `main.js` passes `DATABASE_URL`,
`REDLINE_DIST_DIR`, `REDLINE_PORT` and `REDLINE_HOST` when it spawns the backend.
`app/main.py` honours `REDLINE_DIST_DIR` because a frozen binary has no source tree to
walk up from.

Set `REDLINE_BACKEND_PORT` to run the desktop app on its own port instead of adopting a
dev backend already on 8001 — useful when both are open at once.

## Not done yet

- **Postgres is still a Docker dependency.** The Docker service is enabled at boot and the
  container carries `restart: unless-stopped`, so in practice the database is already up
  before the app launches — and the app starts it if not. Removing Docker entirely would
  mean either bundling a portable Postgres build or moving to a per-user cluster via the
  system `initdb`, and migrating the existing volume with `pg_dump`. That relocates live
  data, so it is a deliberate decision rather than a cleanup.
- **No auto-update and no code signing** — `npm run dist` produces an unsigned local artifact.

## Colours

The UI uses exactly two colours, taken from the icon: `#1E1E1E` and `#ED0020`. The tokens
live in `frontend/src/theme.js`, which is the only place a colour may be defined. Three
places outside the React app have to be kept in step by hand, because they paint before any
stylesheet loads: `WINDOW_BG` in `main.js`, the `<style>` block in `frontend/index.html`,
and `splash.html`.

## Recent Changes

- **2026-08-07** — Two-colour dark theme across the whole UI (`frontend/src/theme.js`),
  including the splash, window background and native controls. Electron's HTTP cache is
  now cleared on launch — without it the rebuilt UI came up as the previous version.
- **2026-08-07** — Desktop integration: `scripts/install-desktop.sh` (`npm run app`), icon
  built from `build/icon.svg`, corrected `StartupWMClass`. Cold-start verified: with the
  container stopped, the app brought it up on the pinned project and all 5 existing drafts
  were still present.
- **2026-08-07** — AppImage packaging: PyInstaller-frozen backend (`backend/desktop_server.py`,
  `scripts/build-backend.sh`), electron-builder config with the three extraResources, pinned
  compose project, `REDLINE_BACKEND_PORT` override, generated `build/icon.png`.
  Gitignored `backend/build/`.
- **2026-08-07** — Created. Electron shell, splash, backend static mount for `frontend/dist`,
  `electron/node_modules` + `electron/dist` gitignored.

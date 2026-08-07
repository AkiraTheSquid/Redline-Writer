"use strict";

/**
 * Redline Writer — Electron desktop shell.
 *
 * Boots the fully local stack and frames it in a desktop window:
 *   Postgres 17 (Docker, port 54330)  ->  FastAPI (port 8001)  ->  React UI
 *
 * There is no sign-in. The frontend enables auth only when VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY are baked in at build time (see frontend/src/lib/supabase.js);
 * this shell never sets them, so `supabase` is null and AuthScreen never renders.
 *
 * Anything already running is reused, never restarted or killed — if you have
 * `start.sh` up in a terminal, launching the desktop app will not disturb it.
 */

const { app, BrowserWindow, Menu, shell, dialog, session } = require("electron");
const { spawn, execFile } = require("child_process");
const net = require("net");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const BACKEND_DIR = path.join(ROOT, "backend");
const VENV_BIN = path.join(BACKEND_DIR, ".venv", "bin");

// Packaged, everything the backend needs is unpacked beside the asar (a frozen
// binary and Python's StaticFiles cannot read from inside an archive). From
// source, it is the repo tree.
const PACKAGED = app.isPackaged;
const RES = process.resourcesPath;

const DIST_DIR = PACKAGED
  ? path.join(RES, "frontend-dist")
  : path.join(ROOT, "frontend", "dist");
const COMPOSE_FILE = PACKAGED
  ? path.join(RES, "docker-compose.yml")
  : path.join(ROOT, "docker-compose.yml");
const FROZEN_BACKEND = PACKAGED
  ? path.join(RES, "backend", "redline-backend", "redline-backend")
  : path.join(BACKEND_DIR, "build", "pyinstaller", "dist", "redline-backend", "redline-backend");

// Override to run the desktop app on its own backend port instead of adopting
// whatever `start.sh` already has on 8001.
const BACKEND_PORT = Number(process.env.REDLINE_BACKEND_PORT || 8001);
const VITE_PORT = 5173;
const DB_PORT = 54330;

// Must match the volume the dev stack already uses. `docker compose` derives the
// volume name from the project, so a different project name here would silently
// create a second, empty database instead of opening existing drafts.
const COMPOSE_PROJECT = "redline-writer-local";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql+psycopg://postgres:postgres@localhost:54330/redline_writer";

// Dev mode loads the Vite server (hot reload); prod loads the built bundle,
// which FastAPI serves itself so the UI and API share one origin.
const DEV = process.env.REDLINE_MODE
  ? process.env.REDLINE_MODE === "dev"
  : !app.isPackaged;

const APP_URL = DEV
  ? `http://localhost:${VITE_PORT}`
  : `http://127.0.0.1:${BACKEND_PORT}`;

/** Processes this shell started, and is therefore responsible for stopping. */
const spawned = [];
let mainWindow = null;
let splashWindow = null;

// ─── Small async helpers ─────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** True if something is already listening on the port. */
function portOpen(port, host = "127.0.0.1", timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

/** Poll until the port accepts connections, or give up. */
async function waitForPort(port, { timeoutMs = 45000, label = `port ${port}` } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true;
    await sleep(400);
  }
  throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for ${label}.`);
}

/** Poll an HTTP endpoint until it answers 2xx/3xx. */
async function waitForHttp(url, { timeoutMs = 45000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "no response";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 400) return true;
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err.message;
    }
    await sleep(400);
  }
  throw new Error(`Timed out waiting for ${url} (${lastErr}).`);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: ROOT, ...opts }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve(stdout)
    );
  });
}

// ─── Stack boot steps ────────────────────────────────────────────────────────

/** Bring up the Docker Postgres container unless it is already accepting connections. */
async function ensureDatabase(status) {
  if (await portOpen(DB_PORT, "127.0.0.1")) {
    status("Database already running.");
    return;
  }

  status("Starting PostgreSQL (Docker)…");
  try {
    await run("docker", [
      "compose",
      "-f",
      COMPOSE_FILE,
      "-p",
      COMPOSE_PROJECT,
      "up",
      "-d",
      "db",
    ]);
  } catch (err) {
    throw new Error(
      `Could not start the Postgres container.\n\n${err.message}\n\n` +
        "Is Docker installed and running? Try: docker compose up -d db"
    );
  }
  await waitForPort(DB_PORT, { label: "PostgreSQL" });
  status("Database ready.");
}

/** Start uvicorn unless the backend is already serving. */
async function ensureBackend(status) {
  if (await portOpen(BACKEND_PORT)) {
    status("Backend already running.");
    return;
  }

  // Environment shared by both launch modes. A frozen binary has no .env beside
  // it, so config comes through here; app.main reads REDLINE_DIST_DIR to find
  // the UI it serves.
  const env = {
    ...process.env,
    DATABASE_URL,
    REDLINE_DIST_DIR: DIST_DIR,
    REDLINE_PORT: String(BACKEND_PORT),
    REDLINE_HOST: "127.0.0.1",
  };

  let cmd;
  let args;

  if (fs.existsSync(FROZEN_BACKEND)) {
    // Packaged (or locally built) binary: bundles Python, applies the schema itself.
    status("Starting backend…");
    cmd = FROZEN_BACKEND;
    args = [];
  } else {
    if (PACKAGED) {
      throw new Error(
        "The bundled backend is missing from this AppImage.\n\n" +
          `Expected it at: ${FROZEN_BACKEND}`
      );
    }

    const uvicorn = path.join(VENV_BIN, "uvicorn");
    const python = path.join(VENV_BIN, "python");
    if (!fs.existsSync(uvicorn)) {
      throw new Error(
        `Python environment missing at ${path.join(BACKEND_DIR, ".venv")}.\n\n` +
          "Create it once with:\n  cd backend && python3 -m venv .venv && " +
          "source .venv/bin/activate && pip install -r requirements.txt"
      );
    }

    status("Applying database schema…");
    await run(python, [path.join("scripts", "init_db.py")], { cwd: BACKEND_DIR, env });

    status("Starting backend…");
    cmd = uvicorn;
    args = ["app.main:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT)];
  }

  const proc = spawn(cmd, args, {
    // The repo's backend/ does not exist inside an AppImage; run the frozen
    // binary from its own directory instead.
    cwd: cmd === FROZEN_BACKEND ? path.dirname(FROZEN_BACKEND) : BACKEND_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  proc.stderr.on("data", (d) => process.stderr.write(`[backend] ${d}`));
  proc.on("exit", (code) => console.log(`[backend] exited (${code})`));
  spawned.push(proc);

  await waitForHttp(`http://127.0.0.1:${BACKEND_PORT}/health`);
  status("Backend ready.");
}

/** In dev, the Vite server must be up; in prod, the built bundle must exist. */
async function ensureFrontend(status) {
  if (DEV) {
    status("Waiting for Vite dev server…");
    if (!(await portOpen(VITE_PORT))) {
      throw new Error(
        `No Vite dev server on port ${VITE_PORT}.\n\n` +
          "Start it with:\n  cd frontend && npm run dev\n\n" +
          "Or launch the desktop app against the built bundle instead:\n" +
          "  npm run start:prod"
      );
    }
    await waitForHttp(APP_URL);
    return;
  }

  if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
    throw new Error(
      `No production build at ${DIST_DIR}.\n\nBuild it with:\n  cd frontend && npm run build`
    );
  }
  // FastAPI mounts frontend/dist at "/", so the bundle is live once the backend is.
  await waitForHttp(APP_URL);
}

// ─── Windows ─────────────────────────────────────────────────────────────────

// The app's dark grey, matching frontend/src/theme.js and the icon. Electron
// paints this before any page renders, so it is what prevents a white flash on
// launch — keep it in step with the UI background.
const WINDOW_BG = "#1E1E1E";

/** Tiny always-on-top window showing boot progress, closed once the UI loads. */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 190,
    frame: false,
    resizable: false,
    show: true,
    backgroundColor: WINDOW_BG,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  return splashWindow;
}

function setStatus(text) {
  console.log(`[redline] ${text}`);
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents
      .executeJavaScript(
        `document.getElementById('status').textContent = ${JSON.stringify(text)};`
      )
      .catch(() => {});
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: WINDOW_BG,
    title: "Redline Writer",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
    splashWindow = null;
    mainWindow.show();
  });

  // F11 toggles fullscreen. The application menu is removed at startup, and with
  // it Electron's default View → Toggle Full Screen accelerator, so the key has
  // to be bound by hand. before-input-event rather than globalShortcut: this must
  // fire only while the writing window is focused, never steal F11 from whatever
  // else the user is in. preventDefault stops the page seeing the keystroke too.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.key !== "F11") return;
    if (input.control || input.alt || input.meta || input.shift) return;
    event.preventDefault();
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });

  // External links open in the real browser, never inside the writing window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

function showFatal(message) {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
  splashWindow = null;
  dialog.showErrorBox("Redline Writer could not start", message);
  app.quit();
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

// A second launch focuses the existing window instead of racing on the ports.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    createSplash();

    try {
      await ensureDatabase(setStatus);
      await ensureBackend(setStatus);
      await ensureFrontend(setStatus);

      setStatus("Opening…");
      // Drop the HTTP cache before loading. The UI is served from localhost, so
      // caching saves nothing — but it does let a rebuilt frontend come up as
      // the *previous* version: Electron replays the cached index.html, which
      // points at asset hashes that no longer exist. The app then looks like the
      // update silently failed. Cheap to clear, so always clear.
      await session.defaultSession.clearCache();
      createMainWindow();
      await mainWindow.loadURL(APP_URL);
    } catch (err) {
      showFatal(err.message);
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

// Stop only the processes this shell started. A backend that was already
// running belongs to the terminal that launched it.
app.on("before-quit", () => {
  for (const proc of spawned) {
    if (!proc.killed) proc.kill("SIGTERM");
  }
});

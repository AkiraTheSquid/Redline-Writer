"use strict";

/**
 * Preload runs with contextIsolation on, so the renderer gets exactly what is
 * exposed here and nothing else — no Node, no `require`, no filesystem.
 *
 * The React app talks to FastAPI over plain relative `fetch` calls (see
 * frontend/src/api.js), so it needs no bridge to work. This exposes only a
 * small marker the UI can read if it ever wants to behave differently on the
 * desktop than in the browser.
 */

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("redline", {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});

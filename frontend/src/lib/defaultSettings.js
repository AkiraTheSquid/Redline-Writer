// Your default session settings, remembered across app restarts.
//
// Only `duration_min`, `min_wpm` and `organizer_text` ever reach the database —
// everything else the settings modal collects (redaction, copy protection, the
// inactivity threshold, the interval plan) lived purely in memory, so it reset
// every time the app was reopened. These live here instead, in localStorage,
// as one app-wide default rather than a per-draft setting: change them once and
// every draft you open afterwards starts from them.
//
// `organizer_text` is deliberately NOT stored — an outline belongs to the draft
// it was written for, not to every future draft.

const STORAGE_KEY = "redline-writer:default-settings";

export const BUILT_IN_DEFAULTS = {
  duration_min: 20,
  min_wpm: 10,
  prevent_copy: false,
  redact_text: false,
  dont_redact_headers: false,
  inactivity_enabled: true,
  inactivity_threshold_sec: 10,
  wpm_grace_period_sec: 10,
  use_intervals: false,
  intervals: [],
  // The unit each threshold was entered in. Stored so "10 minutes" comes back
  // as "10 minutes" rather than being re-derived into something like "1.5
  // minutes" from the seconds value alone.
  inactivity_unit: "seconds",
  wpm_delay_unit: "seconds",
};

function positiveInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function unit(value, fallback) {
  return value === "minutes" || value === "seconds" ? value : fallback;
}

function sanitizeIntervals(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((it) => it && typeof it === "object")
    .map((it) => ({
      name: typeof it.name === "string" ? it.name : "",
      minutes: String(positiveInt(it.minutes, 5)),
      type: ["work", "edit", "break"].includes(it.type) ? it.type : "work",
    }));
}

/** Coerce anything (stored JSON, a modal submission) into a valid settings object. */
export function sanitizeSettings(raw) {
  const cfg = raw && typeof raw === "object" ? raw : {};
  const inactivityEnabled =
    cfg.inactivity_enabled === undefined
      ? BUILT_IN_DEFAULTS.inactivity_enabled
      : !!cfg.inactivity_enabled;

  return {
    duration_min: positiveInt(cfg.duration_min, BUILT_IN_DEFAULTS.duration_min),
    min_wpm: positiveInt(cfg.min_wpm, BUILT_IN_DEFAULTS.min_wpm),
    prevent_copy: !!cfg.prevent_copy,
    redact_text: !!cfg.redact_text,
    dont_redact_headers: !!cfg.dont_redact_headers,
    inactivity_enabled: inactivityEnabled,
    // 0 is meaningful here: it is how "inactivity deletion is off" is encoded.
    inactivity_threshold_sec: inactivityEnabled
      ? positiveInt(cfg.inactivity_threshold_sec, BUILT_IN_DEFAULTS.inactivity_threshold_sec)
      : 0,
    wpm_grace_period_sec: positiveInt(
      cfg.wpm_grace_period_sec,
      BUILT_IN_DEFAULTS.wpm_grace_period_sec
    ),
    use_intervals: !!cfg.use_intervals,
    intervals: cfg.use_intervals ? sanitizeIntervals(cfg.intervals) : [],
    inactivity_unit: unit(cfg.inactivity_unit, BUILT_IN_DEFAULTS.inactivity_unit),
    wpm_delay_unit: unit(cfg.wpm_delay_unit, BUILT_IN_DEFAULTS.wpm_delay_unit),
  };
}

/** The saved defaults, or the built-in ones if nothing has been saved yet. */
export function loadDefaultSettings() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...BUILT_IN_DEFAULTS };
    return sanitizeSettings(JSON.parse(stored));
  } catch {
    // Corrupt entry or no localStorage at all — fall back rather than break the app.
    return { ...BUILT_IN_DEFAULTS };
  }
}

/** Persist `config` as the app-wide defaults. Returns what was actually stored. */
export function saveDefaultSettings(config) {
  const clean = sanitizeSettings(config);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Storage full or unavailable — the session still runs with these settings,
    // they just will not survive a restart.
  }
  return clean;
}

/** Forget the saved defaults and go back to the built-in ones. */
export function clearDefaultSettings() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — loadDefaultSettings() already falls back on read errors.
  }
  return { ...BUILT_IN_DEFAULTS };
}

/** True when the user has saved defaults of their own. */
export function hasSavedDefaults() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

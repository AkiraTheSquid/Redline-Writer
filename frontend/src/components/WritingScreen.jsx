import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api.js";
import SettingsModal from "./SettingsModal.jsx";
import RichEditor, { extractTiptapHeaders } from "./RichEditor.jsx";

// ─── helpers ────────────────────────────────────────────────────────────────

function countWords(str) {
  const trimmed = str.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatTime(sec) {
  if (sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function beep(frequency = 750, durationMs = 150) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    osc.onended = () => ctx.close();
  } catch {
    // silently ignore
  }
}

const SIDEBAR_COLORS = [
  "#FF0000", "#FF2020", "#FF4040", "#FF6060", "#FF8080",
  "#FFA0A0", "#FFC0C0", "#FFD0D0", "#FFE0E0", "#FFFFFF",
];

function getSidebarColor(currentWpm, minWpm) {
  const delta = currentWpm - minWpm;
  if (delta <= 1) return SIDEBAR_COLORS[0];
  if (delta >= 10) return SIDEBAR_COLORS[9];
  const idx = Math.min(8, Math.max(1, Math.floor(((delta - 1) * 8) / 9) + 1));
  return SIDEBAR_COLORS[idx];
}

const BLOCKED_KEYS = new Set([
  "Tab", "Delete", "Insert", "Home", "End", "PageUp", "PageDown",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
]);

const LEFT_PAD_W = 260;
const OUTLINE_W = 240;
const RIGHT_PAD_W = 260;

// ─── component ──────────────────────────────────────────────────────────────

export default function WritingScreen({ draft, onEnd }) {
  // ── Draft mode state ─────────────────────────────────────────────────────
  const [sessionMode, setSessionMode] = useState(false); // false = free writing, true = timed session
  const [showSettings, setShowSettings] = useState(null); // null | 'start' | 'edit'
  const [draftTitle, setDraftTitle] = useState(draft.title || "");
  // Local copy of settings so the modal pre-fills correctly after editing
  const [draftConfig, setDraftConfig] = useState({
    duration_min: draft.duration_min || 20,
    min_wpm: draft.min_wpm || 10,
    organizer_text: draft.organizer_text || "",
  });

  // ── Session config (set when timed session starts) ───────────────────────
  const sessionConfigRef = useRef(null);

  // ── Session DB state ─────────────────────────────────────────────────────
  const sessionIdRef = useRef(draft.id);
  const sessionEndedRef = useRef(false);

  // ── Writing state (refs for use inside interval callback) ────────────────
  // textRef holds plain text (from TipTap's .getText()) for word/char counting
  const textRef = useRef(draft.content || "");
  const organizerRef = useRef(draft.organizer_text || "");
  const sessionStartRef = useRef(null);
  const intervalStartRef = useRef(null);
  const wpmStartRef = useRef(null);
  const hasTypedRef = useRef(false);
  const lastCharCountRef = useRef(0);
  const inactivitySecRef = useRef(0);
  const baselineWordsRef = useRef(0);
  const autosaveTickRef = useRef(0);
  const intervalDurationSecRef = useRef(0);
  const breakExpiredRef = useRef(false);

  // ── Display state ────────────────────────────────────────────────────────
  const [displayWpm, setDisplayWpm] = useState(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [sidebarColor, setSidebarColor] = useState("#FFFFFF");
  const [outcome, setOutcome] = useState(null);
  const [outlineItems, setOutlineItems] = useState([]);
  const [intervalIndex, setIntervalIndex] = useState(0);
  const [editWorkMode, setEditWorkMode] = useState(false);

  // ── Editor ref (TipTap, exposes getHTML/getText/getEditor/clearContent) ──
  const editorRef = useRef(null);
  // htmlRef mirrors the current editor HTML at all times — used for saving,
  // since editorRef.current may be null at the moment endSession fires.
  const htmlRef = useRef(draft.content || "");

  // ── RichEditor onChange: keep textRef + htmlRef + outline in sync ─────────
  function handleRichEditorChange(html, text) {
    textRef.current = text;
    htmlRef.current = html;
    const tiptapEditor = editorRef.current?.getEditor();
    if (tiptapEditor) {
      setOutlineItems(extractTiptapHeaders(tiptapEditor));
    }
    if (!sessionMode) {
      scheduleDraftSave(html);
    }
  }

  // Populate outline + sync refs on initial editor mount (before first keystroke)
  function handleEditorReady(tiptapEditor) {
    const headers = extractTiptapHeaders(tiptapEditor);
    setOutlineItems(headers);
    const text = tiptapEditor.getText({ blockSeparator: "\n" });
    const html = tiptapEditor.getHTML();
    textRef.current = text;
    htmlRef.current = html;
  }

  // ── Draft mode auto-save (debounced, 1.5s after last keystroke) ──────────
  const draftSaveTimeoutRef = useRef(null);
  function scheduleDraftSave(content) {
    clearTimeout(draftSaveTimeoutRef.current);
    draftSaveTimeoutRef.current = setTimeout(() => {
      api.patchSession(draft.id, { content }).catch(() => {});
    }, 1500);
  }

  // Save title on blur
  function handleTitleBlur() {
    api.patchSession(draft.id, { title: draftTitle }).catch(() => {});
  }

  // Save content + title before navigating back
  async function handleBack() {
    clearTimeout(draftSaveTimeoutRef.current);
    try {
      await api.patchSession(draft.id, { content: htmlRef.current, title: draftTitle });
    } catch {}
    onEnd();
  }

  // ── Settings modal submit ────────────────────────────────────────────────
  function handleSettingsSubmit(config) {
    // Always patch the draft with updated settings
    const patch = {
      duration_min: config.duration_min,
      min_wpm: config.min_wpm,
      organizer_text: config.organizer_text,
    };
    setDraftConfig((prev) => ({ ...prev, ...patch, ...config }));
    organizerRef.current = config.organizer_text;
    api.patchSession(draft.id, patch).catch(() => {});

    if (showSettings === "start") {
      // Start timed session
      sessionConfigRef.current = config;
      setShowSettings(null);
      setSessionMode(true);
    } else {
      // Just save settings
      setShowSettings(null);
    }
  }

  // ── Session: derived config values ───────────────────────────────────────
  const cfg = sessionConfigRef.current || {};
  const duration_min = cfg.duration_min || 20;
  const min_wpm = cfg.min_wpm || 10;
  const preventCopy = cfg.prevent_copy || false;
  const redactText = cfg.redact_text || false;
  const dontRedactHeaders = cfg.dont_redact_headers || false;
  const inactivityEnabled = cfg.inactivity_enabled || false;
  const inactivityThresholdSec = cfg.inactivity_threshold_sec || 10;
  const useIntervals = cfg.use_intervals || false;
  const intervalConfig = cfg.intervals || [];

  const intervals = useIntervals && Array.isArray(intervalConfig) && intervalConfig.length
    ? intervalConfig
    : [{ name: "", minutes: String(duration_min), type: "work" }];

  const currentInterval = intervals[intervalIndex] || intervals[0];
  const intervalType = currentInterval?.type || "work";
  const isBreak = intervalType === "break";
  const isEdit = intervalType === "edit";
  const isWorkMode = intervalType === "work" || (intervalType === "edit" && editWorkMode);
  const isLastInterval = intervalIndex >= intervals.length - 1;
  const effectivePreventCopy = preventCopy && !isBreak;

  // ── Start timed session when sessionMode becomes true ────────────────────
  useEffect(() => {
    if (!sessionMode || outcome) return;
    baselineWordsRef.current = countWords(textRef.current);
    sessionEndedRef.current = false;
    sessionStartRef.current = Date.now();
    startIntervalAt(0);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, [sessionMode]);

  // ── End session (saves to DB, returns to draft mode) ────────────────────
  const endSession = useCallback(async (outcomeStr) => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;

    if (outcomeStr.startsWith("deleted")) {
      try {
        await api.deleteSession(sessionIdRef.current);
      } catch {}
      document.exitFullscreen?.().catch(() => {});
      setSessionMode(false);
      setEditWorkMode(false);
      setIntervalIndex(0);
      setDisplayTime(0);
      setDisplayWpm(0);
      setSidebarColor("#FFFFFF");
      setOutcome(outcomeStr);
      return;
    }

    const htmlContent = htmlRef.current;
    const textContent = textRef.current;
    const elapsed = sessionStartRef.current
      ? Math.floor((Date.now() - sessionStartRef.current) / 1000)
      : 0;
    const words = countWords(textContent);
    const wpm = elapsed > 0 ? Math.round((words * 60) / elapsed) : 0;
    const outcomeForSave = "completed";

    try {
      await api.endSession(sessionIdRef.current, {
        outcome: outcomeForSave,
        content: htmlContent,
        organizer_text: organizerRef.current,
        word_count: words,
        wpm_at_end: wpm,
        elapsed_sec: elapsed,
      });
    } catch {}

    document.exitFullscreen?.().catch(() => {});
    setSessionMode(false);
    setEditWorkMode(false);
    setIntervalIndex(0);
    setDisplayTime(0);
    setDisplayWpm(0);
    setSidebarColor("#FFFFFF");
  }, []);

  // ── startIntervalAt ───────────────────────────────────────────────────────
  const startIntervalAt = useCallback((nextIdx) => {
    const config = sessionConfigRef.current || {};
    const useIntervalsLocal = config.use_intervals || false;
    const intervalConfigLocal = config.intervals || [];
    const dur = config.duration_min || 20;
    const intervalsLocal = useIntervalsLocal && Array.isArray(intervalConfigLocal) && intervalConfigLocal.length
      ? intervalConfigLocal
      : [{ name: "", minutes: String(dur), type: "work" }];

    const nextInterval = intervalsLocal[nextIdx];
    if (!nextInterval) return;
    const nextMinutes = parseInt(nextInterval.minutes, 10) || 1;
    intervalStartRef.current = Date.now();
    wpmStartRef.current = Date.now();
    intervalDurationSecRef.current = nextMinutes * 60;
    setDisplayTime(nextMinutes * 60);
    setIntervalIndex(nextIdx);
    setEditWorkMode(false);
    breakExpiredRef.current = false;

    const currentText = textRef.current;
    const currentWords = countWords(currentText);
    const currentChars = currentText.length;
    baselineWordsRef.current = currentWords;
    hasTypedRef.current = currentChars > 0;
    lastCharCountRef.current = currentChars;
    inactivitySecRef.current = 0;
  }, []);

  // ── Key blocker ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionMode) return;

    function onKeyDown(e) {
      if (BLOCKED_KEYS.has(e.key)) { e.preventDefault(); return; }
      if (effectivePreventCopy && (e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "v" || e.key === "x")) {
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [sessionMode, outcome, effectivePreventCopy]);

  // ── Copy blocker ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionMode || !effectivePreventCopy) return;
    function onCopy(e) { e.preventDefault(); }
    window.addEventListener("copy", onCopy, true);
    return () => window.removeEventListener("copy", onCopy, true);
  }, [sessionMode, effectivePreventCopy]);

  // ── Main ticker (session mode only) ──────────────────────────────────────
  useEffect(() => {
    if (!sessionMode || outcome) return;

    const timer = setInterval(() => {
      if (sessionEndedRef.current) return;
      if (!intervalStartRef.current) return;

      const config = sessionConfigRef.current || {};
      const minWpmLocal = config.min_wpm || 10;
      const inactEnabled = config.inactivity_enabled || false;
      const inactThreshold = config.inactivity_threshold_sec || 10;

      const useIntervalsLocal = config.use_intervals || false;
      const intervalConfigLocal = config.intervals || [];
      const dur = config.duration_min || 20;
      const intervalsLocal = useIntervalsLocal && Array.isArray(intervalConfigLocal) && intervalConfigLocal.length
        ? intervalConfigLocal
        : [{ name: "", minutes: String(dur), type: "work" }];
      const isLastLocal = intervalIndex >= intervalsLocal.length - 1;
      const currentLocal = intervalsLocal[intervalIndex] || intervalsLocal[0];
      const typeLocal = currentLocal?.type || "work";
      const isBreakLocal = typeLocal === "break";
      const isWorkModeLocal = typeLocal === "work" || (typeLocal === "edit" && editWorkMode);

      const intervalElapsedSec = Math.floor((Date.now() - intervalStartRef.current) / 1000);
      const remaining = intervalDurationSecRef.current - intervalElapsedSec;

      if (remaining <= 0) {
        if (isBreakLocal) {
          if (!breakExpiredRef.current) { breakExpiredRef.current = true; beep(750, 150); }
          setDisplayTime(0);
          if (isLastLocal) { clearInterval(timer); endSession("completed"); }
          return;
        }
        clearInterval(timer);
        const nextIdx = intervalIndex + 1;
        if (nextIdx >= intervalsLocal.length) { endSession("completed"); return; }
        startIntervalAt(nextIdx);
        return;
      }

      setDisplayTime(remaining);

      // Use textRef.current (plain text kept in sync by handleRichEditorChange)
      const charCount = textRef.current.length;
      const wordCount = countWords(textRef.current);
      const wpmElapsedSec = wpmStartRef.current ? Math.floor((Date.now() - wpmStartRef.current) / 1000) : 0;
      const netWords = Math.max(0, wordCount - baselineWordsRef.current);
      const wpm = wpmElapsedSec > 0 ? Math.round((netWords * 60) / wpmElapsedSec) : 0;
      setDisplayWpm(wpm);
      setSidebarColor(isBreakLocal ? "#FFFFFF" : getSidebarColor(wpm, minWpmLocal));

      if (isWorkModeLocal && inactEnabled) {
        if (charCount > 0) hasTypedRef.current = true;
        if (hasTypedRef.current) {
          if (charCount !== lastCharCountRef.current) {
            inactivitySecRef.current = 0;
            lastCharCountRef.current = charCount;
          } else {
            inactivitySecRef.current += 1;
          }
          const threshold = Math.max(1, inactThreshold);
          const warningStart = Math.max(1, threshold - 3);
          if (inactivitySecRef.current >= warningStart && inactivitySecRef.current < threshold) beep(750, 150);
          if (inactivitySecRef.current >= threshold) { clearInterval(timer); endSession("deleted_inactivity"); return; }
        }

        if (wpmElapsedSec >= 10 && wpm < minWpmLocal) { clearInterval(timer); endSession("deleted_wpm"); return; }
      }

      // Autosave every 2 ticks
      autosaveTickRef.current += 1;
      if (autosaveTickRef.current >= 2 && sessionIdRef.current) {
        autosaveTickRef.current = 0;
        const htmlContent = htmlRef.current;
        const totalElapsed = sessionStartRef.current ? Math.floor((Date.now() - sessionStartRef.current) / 1000) : 0;
        api.patchSession(sessionIdRef.current, {
          content: htmlContent,
          organizer_text: organizerRef.current,
          word_count: wordCount,
          wpm_at_end: wpm,
          elapsed_sec: totalElapsed,
        }).catch(() => {});
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionMode, outcome, intervalIndex, editWorkMode, endSession, startIntervalAt]);

  // ── Deletion overlay ─────────────────────────────────────────────────────
  if (outcome && outcome.startsWith("deleted")) {
    const msgs = {
      deleted_inactivity: {
        title: "Draft deleted.",
        desc: "You stopped typing for too long. Everything was deleted.",
      },
      deleted_wpm: {
        title: "Draft deleted.",
        desc: "Your words per minute dropped too low. Everything was deleted.",
      },
      deleted_abandoned: {
        title: "Draft deleted.",
        desc: "You abandoned the session. Everything was deleted.",
      },
    };
    const m = msgs[outcome] || { title: "Draft deleted.", desc: "This draft was deleted." };
    return (
      <div style={overlay}>
        <div style={overlayCard}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#FF0000", marginBottom: 12 }}>
            {m.title}
          </div>
          <div style={{ fontSize: 15, color: "#555", marginBottom: 28 }}>{m.desc}</div>
          <button style={btnRed} onClick={onEnd}>Next</button>
        </div>
      </div>
    );
  }

  // ── Shared editor area (used in both modes) ───────────────────────────────
  const topBarH = 48;

  const editorArea = (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Left pad */}
      <div style={{ width: LEFT_PAD_W, flexShrink: 0, background: sidebarColor, transition: "background 0.4s" }} />

      {/* Outline */}
      <div style={{ width: OUTLINE_W, flexShrink: 0, borderRight: "1px solid #eee", padding: "12px 10px", background: "#fafafa", overflowY: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Headers
        </div>
        {outlineItems.length === 0 ? (
          <div style={{ fontSize: 12, color: "#aaa" }}>No headers yet.</div>
        ) : (
          outlineItems.map((h, idx) => (
            <button
              key={`${h.pos}-${idx}`}
              onClick={() => {
                const tiptapEditor = editorRef.current?.getEditor();
                if (!tiptapEditor || h.pos == null) return;
                tiptapEditor.chain().focus().setTextSelection(h.pos).scrollIntoView().run();
              }}
              style={{ display: "block", width: "100%", textAlign: "left", fontSize: 13, color: "#444", background: "transparent", border: "none", padding: "4px 6px", marginLeft: (h.level - 1) * 10, cursor: "pointer" }}
              title={h.text}
            >
              {"#".repeat(h.level)} {h.text}
            </button>
          ))
        )}
      </div>

      {/* Main editor — RichEditor includes its own toolbar */}
      <RichEditor
        ref={editorRef}
        initialContent={draft.content}
        onChange={handleRichEditorChange}
        onReady={handleEditorReady}
        placeholder="Start writing…"
        autoFocus
        redactText={sessionMode && redactText}
        dontRedactHeaders={dontRedactHeaders}
      />

      {/* Right pad */}
      <div style={{ width: RIGHT_PAD_W, flexShrink: 0, background: sidebarColor, transition: "background 0.4s" }} />
    </div>
  );

  // ── Draft mode UI ─────────────────────────────────────────────────────────
  if (!sessionMode) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#fff" }}>
        {/* Draft mode top bar */}
        <div style={{
          height: topBarH, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", background: "#fff", borderBottom: "1px solid #eee", flexShrink: 0, gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
            <button
              onClick={handleBack}
              style={{ fontSize: 13, color: "#888", background: "none", border: "none", cursor: "pointer", padding: "4px 6px", flexShrink: 0 }}
            >
              ← Drafts
            </button>
            <input
              value={draftTitle}
              placeholder="Untitled draft"
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={handleTitleBlur}
              style={{
                flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 15, fontWeight: 600,
                color: "#222", fontFamily: "inherit", background: "transparent",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setShowSettings("edit")}
              style={{ fontSize: 13, padding: "6px 14px", border: "1px solid #ddd", borderRadius: 5, background: "#fff", color: "#555", cursor: "pointer" }}
            >
              Edit Settings
            </button>
            <button
              onClick={() => setShowSettings("start")}
              style={{ fontSize: 13, fontWeight: 700, padding: "7px 16px", border: "none", borderRadius: 5, background: "#FF2020", color: "#fff", cursor: "pointer" }}
            >
              Start Session
            </button>
          </div>
        </div>

        {editorArea}

        {showSettings && (
          <SettingsModal
            initialConfig={draftConfig}
            mode={showSettings}
            onSubmit={handleSettingsSubmit}
            onClose={() => setShowSettings(null)}
          />
        )}
      </div>
    );
  }

  // ── Session mode UI ───────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#fff" }}>
      {/* Session mode top bar */}
      <div style={{
        height: topBarH, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", background: "#fff", borderBottom: "1px solid #eee", flexShrink: 0, userSelect: "none",
      }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>
          WPM: {displayWpm}
          <span style={{ color: "#FF0000", fontSize: 13, marginLeft: 8 }}>(min {min_wpm})</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: "#111" }}>{formatTime(displayTime)}</span>
          {isEdit && !editWorkMode && (
            <button
              style={{ fontSize: 12, padding: "4px 10px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", color: "#888" }}
              onClick={() => {
                setEditWorkMode(true);
                wpmStartRef.current = Date.now();
                baselineWordsRef.current = countWords(textRef.current);
                const chars = textRef.current.length;
                hasTypedRef.current = chars > 0;
                lastCharCountRef.current = chars;
                inactivitySecRef.current = 0;
              }}
            >
              Switch to Work
            </button>
          )}
          {isBreak && (
            <button
              style={{ fontSize: 12, padding: "4px 10px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", color: "#888" }}
              onClick={() => { if (isLastInterval) { endSession("completed"); return; } startIntervalAt(intervalIndex + 1); }}
            >
              End Break
            </button>
          )}
          {!isBreak && (
            <button
              style={{ fontSize: 12, padding: "4px 12px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", color: "#888" }}
              onClick={() => endSession("deleted_abandoned")}
            >
              Abandon Session (Deletes the Draft)
            </button>
          )}
        </div>
      </div>

      {editorArea}
    </div>
  );
}

// ── shared styles ──────────────────────────────────────────────────────────
const overlay = {
  position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(255,255,255,0.96)", zIndex: 9999,
};
const overlayCard = {
  textAlign: "center", padding: "48px 56px", border: "1px solid #ddd", borderRadius: 10,
  boxShadow: "0 4px 32px rgba(0,0,0,0.10)", background: "#fff", maxWidth: 440,
};
const btnRed = {
  padding: "12px 32px", fontSize: 15, fontWeight: 700,
  background: "#FF2020", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer",
};

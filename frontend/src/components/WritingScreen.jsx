import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../api.js";

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
    // silently ignore if AudioContext unavailable
  }
}

function maskText(str, allowHeaders) {
  if (!allowHeaders) return str.replace(/[A-Za-z0-9]/g, "*");
  return str
    .split("\n")
    .map((line) => {
      if (/^#+\s/.test(line)) return line;
      return line.replace(/[A-Za-z0-9]/g, "*");
    })
    .join("\n");
}

function extractHeaders(text) {
  const lines = text.split("\n");
  const headers = [];
  let index = 0;
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      headers.push({
        level: match[1].length,
        text: match[2].trim() || "(blank)",
        index,
      });
    }
    index += line.length + 1;
  }
  return headers;
}

function getLineHeightPx(textarea) {
  const style = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight);
  if (!Number.isNaN(lineHeight)) return lineHeight;
  const fontSize = parseFloat(style.fontSize) || 16;
  return fontSize * 1.7;
}

// Sidebar color: index 0 = hottest red, 9 = white
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

// Keys to block during a session (matching original AHK script)
const BLOCKED_KEYS = new Set([
  "Tab", "Delete", "Insert", "Home", "End", "PageUp", "PageDown",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
]);

// Column widths (px) — matching original AHK layout proportions
const LEFT_PAD_W = 260;
const OUTLINE_W = 240;
const RIGHT_PAD_W = 260;

// ─── component ──────────────────────────────────────────────────────────────

export default function WritingScreen({ config, onEnd }) {
  const {
    duration_min,
    min_wpm,
    organizer_text: initialOrganizer,
    prevent_copy: preventCopy,
    redact_text: redactText,
    dont_redact_headers: dontRedactHeaders,
    inactivity_enabled: inactivityEnabled,
    inactivity_threshold_sec: inactivityThresholdSec,
    use_intervals: useIntervals,
    intervals: intervalConfig,
  } = config;

  // Session DB state
  const sessionIdRef = useRef(null);
  const [sessionCreated, setSessionCreated] = useState(false);
  const [initError, setInitError] = useState(null);

  // Writing state (refs for use inside interval callback)
  const textRef = useRef("");
  const organizerRef = useRef(initialOrganizer);
  const sessionStartRef = useRef(null);
  const intervalStartRef = useRef(null);
  const wpmStartRef = useRef(null);
  const hasTypedRef = useRef(false);
  const lastCharCountRef = useRef(0);
  const inactivitySecRef = useRef(0);
  const baselineWordsRef = useRef(countWords(initialOrganizer)); // actually baseline of *content* which starts empty
  const autosaveTickRef = useRef(0);
  const sessionEndedRef = useRef(false);
  const intervalDurationSecRef = useRef(0);
  const breakExpiredRef = useRef(false);

  // Display state (updated from interval)
  const [displayWpm, setDisplayWpm] = useState(0);
  const [displayTime, setDisplayTime] = useState(duration_min * 60);
  const [sidebarColor, setSidebarColor] = useState(SIDEBAR_COLORS[0]);
  const [outcome, setOutcome] = useState(null); // null | 'completed' | 'deleted_inactivity' | 'deleted_wpm' | 'deleted_abandoned'
  const [maskedText, setMaskedText] = useState("");
  const [outlineItems, setOutlineItems] = useState([]);
  const [intervalIndex, setIntervalIndex] = useState(0);
  const [editWorkMode, setEditWorkMode] = useState(false);

  const intervals = useIntervals && Array.isArray(intervalConfig) && intervalConfig.length
    ? intervalConfig
    : [{ name: "", minutes: String(duration_min), type: "work" }];
  const currentInterval = intervals[intervalIndex] || intervals[0];
  const intervalType = currentInterval?.type || "work";
  const isBreak = intervalType === "break";
  const isEdit = intervalType === "edit";
  const isWorkMode = intervalType === "work" || (intervalType === "edit" && editWorkMode);
  const isLastInterval = intervalIndex >= intervals.length - 1;
  const effectiveRedact = redactText && !isBreak;
  const effectivePreventCopy = preventCopy && !isBreak;

  // DOM refs
  const mainEditRef = useRef(null);
  const overlayRef = useRef(null);

  // Create session in DB on mount
  useEffect(() => {
    baselineWordsRef.current = 0; // content starts empty
    api
      .createSession({
        duration_min,
        min_wpm,
        reminder_interval_min: 0,
        organizer_text: initialOrganizer,
      })
      .then((session) => {
        sessionIdRef.current = session.id;
        setSessionCreated(true);
        sessionStartRef.current = Date.now();
        startIntervalAt(0);
        // request fullscreen
        document.documentElement.requestFullscreen?.().catch(() => {});
      })
      .catch((err) => setInitError(String(err)));
  }, []);

  // End the session (saves to DB, clears text if deleted)
  const endSession = useCallback(
    async (outcomeStr) => {
      if (sessionEndedRef.current) return;
      sessionEndedRef.current = true;

      const content = outcomeStr.startsWith("deleted") ? "" : textRef.current;
      const organizer = organizerRef.current;
      const elapsed = sessionStartRef.current
        ? Math.floor((Date.now() - sessionStartRef.current) / 1000)
        : 0;
      const words = countWords(content);
      const wpm =
        elapsed > 0 ? Math.round((words * 60) / elapsed) : 0;

      if (outcomeStr.startsWith("deleted") && mainEditRef.current) {
        mainEditRef.current.value = "";
        textRef.current = "";
      }

      setOutcome(outcomeStr);

      if (sessionIdRef.current) {
        try {
          await api.endSession(sessionIdRef.current, {
            outcome: outcomeStr,
            content,
            organizer_text: organizer,
            word_count: words,
            wpm_at_end: wpm,
            elapsed_sec: elapsed,
          });
        } catch {
          // best-effort
        }
      }

      document.exitFullscreen?.().catch(() => {});
    },
    []
  );

  const startIntervalAt = useCallback(
    (nextIdx) => {
      const nextInterval = intervals[nextIdx];
      if (!nextInterval) return;
      const nextMinutes = parseInt(nextInterval.minutes, 10) || 1;
      intervalStartRef.current = Date.now();
      wpmStartRef.current = Date.now();
      intervalDurationSecRef.current = nextMinutes * 60;
      setDisplayTime(nextMinutes * 60);
      setIntervalIndex(nextIdx);
      setEditWorkMode(false);
      breakExpiredRef.current = false;
      const currentText = mainEditRef.current ? mainEditRef.current.value : textRef.current;
      const currentWords = countWords(currentText);
      const currentChars = currentText.length;
      baselineWordsRef.current = currentWords;
      hasTypedRef.current = currentChars > 0;
      lastCharCountRef.current = currentChars;
      inactivitySecRef.current = 0;
      if (redactText) {
        setMaskedText(maskText(currentText, dontRedactHeaders));
      } else {
        setMaskedText("");
      }
    },
    [intervals, redactText, dontRedactHeaders]
  );

  // Key blocker
  useEffect(() => {
    if (!sessionCreated) return;

    function onKeyDown(e) {
      if (outcome) return;

      // Block disallowed keys
      if (BLOCKED_KEYS.has(e.key)) {
        e.preventDefault();
        return;
      }
      // Block copy/paste/cut if enabled
      if (effectivePreventCopy && (e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "v" || e.key === "x")) {
        e.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [sessionCreated, outcome, effectivePreventCopy]);

  // Copy blocker (context menu, menu bar, etc.)
  useEffect(() => {
    if (!sessionCreated || !effectivePreventCopy) return;
    function onCopy(e) {
      e.preventDefault();
    }
    window.addEventListener("copy", onCopy, true);
    return () => window.removeEventListener("copy", onCopy, true);
  }, [sessionCreated, effectivePreventCopy]);

  // Main ticker — runs every second
  useEffect(() => {
    if (!sessionCreated || outcome) return;

    const interval = setInterval(() => {
      if (sessionEndedRef.current) return;
      if (!intervalStartRef.current) return;

      const intervalElapsedSec = Math.floor((Date.now() - intervalStartRef.current) / 1000);
      const remaining = intervalDurationSecRef.current - intervalElapsedSec;

      // ── time remaining ──
      if (remaining <= 0) {
        if (isBreak) {
          if (!breakExpiredRef.current) {
            breakExpiredRef.current = true;
            beep(750, 150);
          }
          setDisplayTime(0);
          if (isLastInterval) {
            clearInterval(interval);
            endSession("completed");
          }
          return;
        }

        // advance to next interval
        clearInterval(interval);
        const nextIdx = intervalIndex + 1;
        if (nextIdx >= intervals.length) {
          endSession("completed");
          return;
        }
        startIntervalAt(nextIdx);
        return;
      }

      setDisplayTime(remaining);

      // ── WPM ──
      const charCount = mainEditRef.current ? mainEditRef.current.value.length : textRef.current.length;
      const wordCount = countWords(mainEditRef.current ? mainEditRef.current.value : textRef.current);
      const wpmElapsedSec = wpmStartRef.current ? Math.floor((Date.now() - wpmStartRef.current) / 1000) : 0;
      const netWords = Math.max(0, wordCount - baselineWordsRef.current);
      const wpm = wpmElapsedSec > 0 ? Math.round((netWords * 60) / wpmElapsedSec) : 0;
      setDisplayWpm(wpm);
      setSidebarColor(isBreak ? "#FFFFFF" : getSidebarColor(wpm, min_wpm));

      if (isWorkMode && inactivityEnabled) {
        // ── inactivity ──
        if (charCount > 0) hasTypedRef.current = true;
        if (hasTypedRef.current) {
          if (charCount !== lastCharCountRef.current) {
            inactivitySecRef.current = 0;
            lastCharCountRef.current = charCount;
          } else {
            inactivitySecRef.current += 1;
          }

          const threshold = Math.max(1, inactivityThresholdSec || 10);
          const warningStart = Math.max(1, threshold - 3);
          if (inactivitySecRef.current >= warningStart && inactivitySecRef.current < threshold) {
            beep(750, 150);
          }
          if (inactivitySecRef.current >= threshold) {
            clearInterval(interval);
            endSession("deleted_inactivity");
            return;
          }
        }

        // ── WPM enforcement (after 60s) ──
        if (wpmElapsedSec >= 60 && wpm < min_wpm) {
          clearInterval(interval);
          endSession("deleted_wpm");
          return;
        }
      }

      // ── autosave every 2 ticks ──
      autosaveTickRef.current += 1;
      if (autosaveTickRef.current >= 2 && sessionIdRef.current) {
        autosaveTickRef.current = 0;
        const currentText = mainEditRef.current ? mainEditRef.current.value : textRef.current;
        const totalElapsed = sessionStartRef.current
          ? Math.floor((Date.now() - sessionStartRef.current) / 1000)
          : 0;
        api
          .patchSession(sessionIdRef.current, {
            content: currentText,
            organizer_text: organizerRef.current,
            word_count: wordCount,
            wpm_at_end: wpm,
            elapsed_sec: totalElapsed,
          })
          .catch(() => {});
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionCreated, outcome, intervalIndex, intervals, isBreak, isLastInterval, isWorkMode, inactivityEnabled, inactivityThresholdSec, min_wpm, startIntervalAt]);

  // ── outcome overlay ──────────────────────────────────────────────────────
  if (initError) {
    return (
      <div style={overlay}>
        <div style={overlayCard}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "red", marginBottom: 12 }}>
            Failed to start session
          </div>
          <div style={{ fontSize: 14, color: "#555", marginBottom: 24 }}>{initError}</div>
          <button style={btnRed} onClick={onEnd}>Back</button>
        </div>
      </div>
    );
  }

  if (outcome) {
    const deleted = outcome.startsWith("deleted");
    const msgs = {
      completed: { title: "Session complete!", color: "#111", desc: "Your writing has been saved." },
      deleted_inactivity: { title: "Too slow — deleted.", color: "#FF0000", desc: "You stopped typing for 10 seconds. Everything is gone." },
      deleted_wpm: { title: "Below minimum WPM — deleted.", color: "#FF0000", desc: "Your words per minute dropped too low. Everything is gone." },
      deleted_abandoned: { title: "Deleted — Abandoned.", color: "#FF0000", desc: "You ended the session. Everything is gone." },
    };
    const m = msgs[outcome] || { title: outcome, color: "#111", desc: "" };
    return (
      <div style={overlay}>
        <div style={overlayCard}>
          <div style={{ fontSize: 24, fontWeight: 700, color: m.color, marginBottom: 12 }}>
            {m.title}
          </div>
          <div style={{ fontSize: 15, color: "#555", marginBottom: 28 }}>{m.desc}</div>
          <button style={btnRed} onClick={onEnd}>View History</button>
        </div>
      </div>
    );
  }

  if (!sessionCreated) {
    return (
      <div style={{ ...overlay, background: "#fff" }}>
        <div style={{ fontSize: 16, color: "#888" }}>Starting session…</div>
      </div>
    );
  }

  // ── writing UI ───────────────────────────────────────────────────────────
  const topBarH = 48;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#fff" }}>
      {/* Top bar */}
      <div
        style={{
          height: topBarH,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          background: "#fff",
          borderBottom: "1px solid #eee",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700 }}>
          WPM: {displayWpm}
          <span style={{ color: "#FF0000", fontSize: 13, marginLeft: 8 }}>
            (min {min_wpm})
          </span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: "#111" }}>
            {formatTime(displayTime)}
          </span>
          {isEdit && !editWorkMode && (
            <button
              style={{ fontSize: 12, padding: "4px 10px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", color: "#888" }}
              onClick={() => {
                setEditWorkMode(true);
                wpmStartRef.current = Date.now();
                const currentText = mainEditRef.current ? mainEditRef.current.value : textRef.current;
                const currentWords = countWords(currentText);
                const currentChars = currentText.length;
                baselineWordsRef.current = currentWords;
                hasTypedRef.current = currentChars > 0;
                lastCharCountRef.current = currentChars;
                inactivitySecRef.current = 0;
                if (redactText) {
                  setMaskedText(maskText(currentText, dontRedactHeaders));
                }
              }}
            >
              Switch to Work
            </button>
          )}
          {isBreak && (
            <button
              style={{ fontSize: 12, padding: "4px 10px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", color: "#888" }}
              onClick={() => {
                if (isLastInterval) {
                  endSession("completed");
                  return;
                }
                startIntervalAt(intervalIndex + 1);
              }}
            >
              End Break
            </button>
          )}
          {!isBreak && (
            <button
              style={{ fontSize: 12, padding: "4px 12px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", color: "#888" }}
              onClick={() => endSession("deleted_abandoned")}
            >
              Abandon Session
            </button>
          )}
        </div>
      </div>

      {/* Three-column editor area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left pad */}
        <div style={{ width: LEFT_PAD_W, flexShrink: 0, background: sidebarColor, transition: "background 0.4s" }} />

        {/* Outline */}
        <div
          style={{
            width: OUTLINE_W,
            flexShrink: 0,
            borderRight: "1px solid #eee",
            padding: "12px 10px",
            background: "#fafafa",
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Headers
          </div>
          {outlineItems.length === 0 ? (
            <div style={{ fontSize: 12, color: "#aaa" }}>No headers yet.</div>
          ) : (
            outlineItems.map((h, idx) => (
              <button
                key={`${h.index}-${idx}`}
                onClick={() => {
                  const textarea = mainEditRef.current;
                  if (!textarea) return;
                  const text = textarea.value;
                  const lineNum = text.slice(0, h.index).split("\n").length - 1;
                  const lineHeight = getLineHeightPx(textarea);
                  textarea.focus();
                  textarea.setSelectionRange(h.index, h.index);
                  const targetTop = Math.max(0, lineNum * lineHeight - textarea.clientHeight * 0.2);
                  textarea.scrollTop = targetTop;
                  if (overlayRef.current) {
                    overlayRef.current.scrollTop = targetTop;
                  }
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  fontSize: 13,
                  color: "#444",
                  background: "transparent",
                  border: "none",
                  padding: "4px 6px",
                  marginLeft: (h.level - 1) * 10,
                  cursor: "pointer",
                }}
                title={h.text}
              >
                {"#".repeat(h.level)} {h.text}
              </button>
            ))
          )}
        </div>

        {/* Main editor */}
        <div style={{ position: "relative", flex: 1, height: "100%" }}>
          {effectiveRedact && (
            <div
              ref={overlayRef}
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
                padding: "16px 20px",
                fontSize: 24,
                fontFamily: effectiveRedact ? "Courier New, monospace" : "inherit",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: maskedText ? "#111" : "#aaa",
                pointerEvents: "none",
              }}
            >
              {maskedText || "Start writing…"}
            </div>
          )}
          <textarea
            ref={mainEditRef}
            autoFocus
            className={effectiveRedact ? "redacted-editor" : undefined}
            onChange={(e) => {
              textRef.current = e.target.value;
              setOutlineItems(extractHeaders(e.target.value));
              if (effectiveRedact) {
                setMaskedText(maskText(e.target.value, dontRedactHeaders));
              }
            }}
            onScroll={() => {
              if (overlayRef.current && mainEditRef.current) {
                overlayRef.current.scrollTop = mainEditRef.current.scrollTop;
                overlayRef.current.scrollLeft = mainEditRef.current.scrollLeft;
              }
            }}
            placeholder={effectiveRedact ? "" : "Start writing…"}
            style={{
              flex: 1,
              height: "100%",
              width: "100%",
              resize: "none",
              border: "none",
              padding: "16px 20px",
              fontSize: 24,
              fontFamily: effectiveRedact ? "Courier New, monospace" : "inherit",
              outline: "none",
              lineHeight: 1.7,
              caretColor: "#111",
              background: effectiveRedact ? "transparent" : "#fff",
            }}
          />
        </div>

        {/* Right pad */}
        <div style={{ width: RIGHT_PAD_W, flexShrink: 0, background: sidebarColor, transition: "background 0.4s" }} />
      </div>
    </div>
  );
}

// ── shared styles ─────────────────────────────────────────────────────────
const overlay = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.96)",
  zIndex: 9999,
};

const overlayCard = {
  textAlign: "center",
  padding: "48px 56px",
  border: "1px solid #ddd",
  borderRadius: 10,
  boxShadow: "0 4px 32px rgba(0,0,0,0.10)",
  background: "#fff",
  maxWidth: 440,
};

const btnRed = {
  padding: "12px 32px",
  fontSize: 15,
  fontWeight: 700,
  background: "#FF2020",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

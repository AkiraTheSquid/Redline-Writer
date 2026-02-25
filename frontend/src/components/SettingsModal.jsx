import { useState } from "react";

const S = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 1000,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    overflowY: "auto",
    padding: "40px 20px",
  },
  card: {
    width: 720,
    padding: "36px 36px 32px",
    background: "#fff",
    borderRadius: 8,
    boxShadow: "0 4px 40px rgba(0,0,0,0.22)",
    flexShrink: 0,
  },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 24, letterSpacing: "-0.3px" },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#444", marginBottom: 6, marginTop: 18 },
  input: {
    width: "100%",
    padding: "9px 12px",
    fontSize: 15,
    border: "1px solid #ccc",
    borderRadius: 5,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: "9px 12px",
    fontSize: 14,
    border: "1px solid #ccc",
    borderRadius: 5,
    outline: "none",
    fontFamily: "inherit",
    resize: "vertical",
    minHeight: 80,
    boxSizing: "border-box",
  },
  hint: { fontSize: 12, color: "#aaa", marginTop: 4 },
};

export default function SettingsModal({ initialConfig, mode, onSubmit, onClose }) {
  const cfg = initialConfig || {};
  const [durationMin, setDurationMin] = useState(String(cfg.duration_min || 20));
  const [useIntervals, setUseIntervals] = useState(cfg.use_intervals || false);
  const [intervals, setIntervals] = useState(
    cfg.use_intervals && cfg.intervals?.length
      ? cfg.intervals
      : [{ name: "", minutes: String(cfg.duration_min || 20), type: "work" }]
  );
  const [minWpm, setMinWpm] = useState(String(cfg.min_wpm || 10));
  const [organizer, setOrganizer] = useState(cfg.organizer_text || "");
  const [preventCopy, setPreventCopy] = useState(cfg.prevent_copy || false);
  const [redactText, setRedactText] = useState(cfg.redact_text || false);
  const [dontRedactHeaders, setDontRedactHeaders] = useState(cfg.dont_redact_headers || false);
  const [inactivityEnabled, setInactivityEnabled] = useState(
    cfg.inactivity_enabled !== undefined ? cfg.inactivity_enabled : true
  );
  const [inactivityValue, setInactivityValue] = useState(
    cfg.inactivity_threshold_sec
      ? String(cfg.inactivity_threshold_sec >= 60 ? cfg.inactivity_threshold_sec / 60 : cfg.inactivity_threshold_sec)
      : "10"
  );
  const [inactivityUnit, setInactivityUnit] = useState(
    cfg.inactivity_threshold_sec >= 60 ? "minutes" : "seconds"
  );
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const dur = parseInt(durationMin, 10);
    const wpm = parseInt(minWpm, 10);
    const inactVal = parseInt(inactivityValue, 10);

    if (!wpm || wpm <= 0) return setError("Min WPM must be a positive number.");
    if (inactivityEnabled && (!inactVal || inactVal <= 0)) {
      return setError("Inactivity threshold must be a positive number.");
    }

    let totalDurationMin = dur;
    if (useIntervals) {
      if (!intervals.length) return setError("Add at least one interval.");
      let sum = 0;
      for (const it of intervals) {
        const m = parseInt(it.minutes, 10);
        if (!m || m <= 0) return setError("Each interval needs a positive duration.");
        sum += m;
      }
      totalDurationMin = sum;
    } else {
      if (!dur || dur <= 0) return setError("Duration must be a positive number.");
    }

    onSubmit({
      duration_min: totalDurationMin,
      min_wpm: wpm,
      organizer_text: organizer,
      prevent_copy: preventCopy,
      redact_text: redactText,
      dont_redact_headers: dontRedactHeaders,
      inactivity_enabled: inactivityEnabled,
      inactivity_threshold_sec: inactivityEnabled
        ? (inactivityUnit === "minutes" ? inactVal * 60 : inactVal)
        : 0,
      use_intervals: useIntervals,
      intervals: useIntervals ? intervals : [],
    });
  }

  return (
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.card}>
        <div style={S.title}>
          {mode === "start" ? "Session Settings" : "Edit Settings"}
        </div>

        <form onSubmit={handleSubmit}>
          <label style={S.label}>Duration</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#444", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={useIntervals}
              onChange={(e) => setUseIntervals(e.target.checked)}
            />
            Use multiple intervals
          </label>
          {!useIntervals && (
            <input
              style={S.input}
              type="number"
              min="1"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
            />
          )}
          {useIntervals && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <div style={{ flex: 1, paddingLeft: 2 }}>Name</div>
                <div style={{ width: 90 }}>Minutes</div>
                <div style={{ width: 140 }}>Type</div>
                <div style={{ width: 78 }} />
              </div>
              {intervals.map((it, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    style={{ ...S.input, flex: 1, minWidth: 140 }}
                    type="text"
                    placeholder="Interval name (optional)"
                    value={it.name}
                    onChange={(e) => {
                      const next = intervals.slice();
                      next[idx] = { ...next[idx], name: e.target.value };
                      setIntervals(next);
                    }}
                  />
                  <input
                    style={{ ...S.input, width: 90 }}
                    type="number"
                    min="1"
                    value={it.minutes}
                    onChange={(e) => {
                      const next = intervals.slice();
                      next[idx] = { ...next[idx], minutes: e.target.value };
                      setIntervals(next);
                    }}
                  />
                  <select
                    style={{ ...S.input, width: 140 }}
                    value={it.type}
                    onChange={(e) => {
                      const next = intervals.slice();
                      next[idx] = { ...next[idx], type: e.target.value };
                      setIntervals(next);
                    }}
                  >
                    <option value="work">Work</option>
                    <option value="edit">Edit</option>
                    <option value="break">Break</option>
                  </select>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" style={{ fontSize: 12, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 4, background: "#fff" }}
                      onClick={() => {
                        if (idx === 0) return;
                        const next = intervals.slice();
                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                        setIntervals(next);
                      }}>↑</button>
                    <button type="button" style={{ fontSize: 12, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 4, background: "#fff" }}
                      onClick={() => {
                        if (idx === intervals.length - 1) return;
                        const next = intervals.slice();
                        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                        setIntervals(next);
                      }}>↓</button>
                    <button type="button" style={{ fontSize: 12, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 4, background: "#fff", color: "#d00" }}
                      onClick={() => { const next = intervals.slice(); next.splice(idx, 1); setIntervals(next); }}>✕</button>
                  </div>
                </div>
              ))}
              <button type="button"
                style={{ fontSize: 13, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 4, background: "#fff", alignSelf: "flex-start" }}
                onClick={() => setIntervals([...intervals, { name: "", minutes: "5", type: "work" }])}>
                + Add interval
              </button>
            </div>
          )}

          <label style={S.label}>Minimum WPM</label>
          <input style={S.input} type="number" min="1" value={minWpm} onChange={(e) => setMinWpm(e.target.value)} />
          <div style={S.hint}>Enforced after the first 60 seconds.</div>

          <label style={S.label}>Organizer / notes (optional)</label>
          <textarea
            style={S.textarea}
            value={organizer}
            placeholder="Paste an outline, notes, or anything you want visible while writing..."
            onChange={(e) => setOrganizer(e.target.value)}
          />

          <label style={S.label}>Copy protection</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#444" }}>
            <input type="checkbox" checked={preventCopy} onChange={(e) => setPreventCopy(e.target.checked)} />
            Prevent copying during the session
          </label>

          <label style={S.label}>Redacted typing</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#444" }}>
            <input type="checkbox" checked={redactText} onChange={(e) => setRedactText(e.target.checked)} />
            Hide letters and numbers while typing
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#666", marginLeft: 22, marginTop: 6 }}>
            <input type="checkbox" checked={dontRedactHeaders} onChange={(e) => setDontRedactHeaders(e.target.checked)} disabled={!redactText} />
            <span>Don&apos;t include headers in redaction</span>
          </label>

          <label style={S.label}>Inactivity deletion</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#444", flexWrap: "wrap" }}>
            <input type="checkbox" checked={inactivityEnabled} onChange={(e) => setInactivityEnabled(e.target.checked)} />
            Delete the text if the user stops typing for
            <input
              type="number" min="1" value={inactivityValue}
              onChange={(e) => setInactivityValue(e.target.value)}
              disabled={!inactivityEnabled}
              style={{ width: 70, fontSize: 14, padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4 }}
            />
            <select value={inactivityUnit} onChange={(e) => setInactivityUnit(e.target.value)} disabled={!inactivityEnabled}
              style={{ fontSize: 14, padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4 }}>
              <option value="seconds">seconds</option>
              <option value="minutes">minutes</option>
            </select>
          </label>

          {error && <div style={{ color: "red", fontSize: 13, marginTop: 10 }}>{error}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: "12px 0",
                fontSize: 15,
                fontWeight: 700,
                background: mode === "start" ? "#FF2020" : "#222",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {mode === "start" ? "Start Session" : "Save Settings"}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "12px 20px",
                fontSize: 14,
                fontWeight: 600,
                background: "transparent",
                color: "#888",
                border: "1px solid #ddd",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

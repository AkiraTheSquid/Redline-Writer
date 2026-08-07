import { useEffect, useState } from "react";
import { api } from "../api.js";
import { T } from "../theme.js";

// There is no green for "completed" — the palette is two colours. Outcome is
// carried by the label text and by weight instead of by hue: a deleted session
// is full-strength red, a completed one is dimmed.
const OUTCOME_LABELS = {
  completed: { label: "Completed", color: T.textMuted },
  deleted_inactivity: { label: "Deleted — inactivity", color: T.text },
  deleted_wpm: { label: "Deleted — low WPM", color: T.text },
  deleted_abandoned: { label: "Deleted — Abandoned", color: T.text },
};

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString();
}

function fmtDur(sec) {
  if (!sec && sec !== 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function SessionHistory({ onNewSession }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api
      .listSessions()
      .then(setSessions)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Session History</h1>
        <button
          onClick={onNewSession}
          style={{
            padding: "10px 22px",
            fontSize: 14,
            fontWeight: 700,
            background: T.text,
            color: T.onRed,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          New Session
        </button>
      </div>

      {loading && <div style={{ color: T.textMuted }}>Loading…</div>}
      {error && <div style={{ color: T.text }}>{error}</div>}
      {!loading && !error && sessions.length === 0 && (
        <div style={{ color: T.textFaint, fontSize: 15 }}>No completed sessions yet.</div>
      )}

      {sessions.map((s) => {
        const oc = OUTCOME_LABELS[s.outcome] || { label: s.outcome, color: T.textMuted };
        const isExpanded = expanded === s.id;
        return (
          <div
            key={s.id}
            style={{
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              marginBottom: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "14px 18px",
                cursor: "pointer",
                background: isExpanded ? T.raised : T.surface,
                gap: 12,
              }}
              onClick={() => setExpanded(isExpanded ? null : s.id)}
            >
              <span style={{ color: oc.color, fontWeight: 700, fontSize: 13, minWidth: 180 }}>
                {oc.label}
              </span>
              <span style={{ color: T.textMuted, fontSize: 13, flex: 1 }}>{fmt(s.created_at)}</span>
              <span style={{ fontSize: 13, color: T.textMuted }}>
                {s.word_count} words · {fmtDur(s.elapsed_sec)} · {s.wpm_at_end} WPM
              </span>
              <span style={{ color: T.textFaint, fontSize: 13, marginLeft: 8 }}>
                {isExpanded ? "▲" : "▼"}
              </span>
            </div>

            {isExpanded && (
              <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", gap: 32, marginTop: 14, marginBottom: 14, fontSize: 13, color: T.textMuted }}>
                  <span>Duration planned: {s.duration_min} min</span>
                  <span>Min WPM: {s.min_wpm}</span>
                  <span>Elapsed: {fmtDur(s.elapsed_sec)}</span>
                  <span>Words: {s.word_count}</span>
                  <span>WPM at end: {s.wpm_at_end}</span>
                </div>

                {s.organizer_text && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.textFaint, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Organizer
                    </div>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: T.textMuted, background: T.surface, borderRadius: 5, padding: "10px 12px", marginBottom: 14 }}>
                      {s.organizer_text}
                    </pre>
                  </>
                )}

                {s.content ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.textFaint, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Content
                    </div>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 14, color: T.text, background: T.surface, borderRadius: 5, padding: "12px 14px", maxHeight: 400, overflowY: "auto" }}>
                      {s.content}
                    </pre>
                  </>
                ) : (
                  <div style={{ color: T.text, fontSize: 13, fontStyle: "italic" }}>
                    Content was deleted.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

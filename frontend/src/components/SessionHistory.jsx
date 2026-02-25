import { useEffect, useState } from "react";
import { api } from "../api.js";

const OUTCOME_LABELS = {
  completed: { label: "Completed", color: "#22aa44" },
  deleted_inactivity: { label: "Deleted — inactivity", color: "#FF0000" },
  deleted_wpm: { label: "Deleted — low WPM", color: "#FF0000" },
  deleted_abandoned: { label: "Deleted — Abandoned", color: "#FF0000" },
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
            background: "#FF2020",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          New Session
        </button>
      </div>

      {loading && <div style={{ color: "#888" }}>Loading…</div>}
      {error && <div style={{ color: "red" }}>{error}</div>}
      {!loading && !error && sessions.length === 0 && (
        <div style={{ color: "#aaa", fontSize: 15 }}>No completed sessions yet.</div>
      )}

      {sessions.map((s) => {
        const oc = OUTCOME_LABELS[s.outcome] || { label: s.outcome, color: "#888" };
        const isExpanded = expanded === s.id;
        return (
          <div
            key={s.id}
            style={{
              border: "1px solid #e0e0e0",
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
                background: isExpanded ? "#fafafa" : "#fff",
                gap: 12,
              }}
              onClick={() => setExpanded(isExpanded ? null : s.id)}
            >
              <span style={{ color: oc.color, fontWeight: 700, fontSize: 13, minWidth: 180 }}>
                {oc.label}
              </span>
              <span style={{ color: "#888", fontSize: 13, flex: 1 }}>{fmt(s.created_at)}</span>
              <span style={{ fontSize: 13, color: "#555" }}>
                {s.word_count} words · {fmtDur(s.elapsed_sec)} · {s.wpm_at_end} WPM
              </span>
              <span style={{ color: "#bbb", fontSize: 13, marginLeft: 8 }}>
                {isExpanded ? "▲" : "▼"}
              </span>
            </div>

            {isExpanded && (
              <div style={{ padding: "0 18px 18px", borderTop: "1px solid #eee" }}>
                <div style={{ display: "flex", gap: 32, marginTop: 14, marginBottom: 14, fontSize: 13, color: "#555" }}>
                  <span>Duration planned: {s.duration_min} min</span>
                  <span>Min WPM: {s.min_wpm}</span>
                  <span>Elapsed: {fmtDur(s.elapsed_sec)}</span>
                  <span>Words: {s.word_count}</span>
                  <span>WPM at end: {s.wpm_at_end}</span>
                </div>

                {s.organizer_text && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#999", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Organizer
                    </div>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#666", background: "#f5f5f5", borderRadius: 5, padding: "10px 12px", marginBottom: 14 }}>
                      {s.organizer_text}
                    </pre>
                  </>
                )}

                {s.content ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#999", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Content
                    </div>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 14, color: "#222", background: "#f9f9f9", borderRadius: 5, padding: "12px 14px", maxHeight: 400, overflowY: "auto" }}>
                      {s.content}
                    </pre>
                  </>
                ) : (
                  <div style={{ color: "#FF0000", fontSize: 13, fontStyle: "italic" }}>
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

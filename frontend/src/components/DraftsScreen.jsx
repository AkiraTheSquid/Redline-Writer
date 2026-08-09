import { useEffect, useState } from "react";
import { api } from "../api.js";
import { T } from "../theme.js";
import { loadDefaultSettings } from "../lib/defaultSettings.js";

export default function DraftsScreen({ onOpen, onSignOut, authEnabled }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .listSessions()
      .then(setDrafts)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function handleNewDraft() {
    setCreating(true);
    try {
      // Start from the saved defaults rather than 20/10, so a new draft matches
      // what the settings modal will show for it.
      const defaults = loadDefaultSettings();
      const draft = await api.createSession({
        duration_min: defaults.duration_min,
        min_wpm: defaults.min_wpm,
        title: "",
        content: "",
        outcome: "draft",
      });
      onOpen(draft);
    } catch (e) {
      setError(String(e));
      setCreating(false);
    }
  }

  function handleTitleChange(draftId, newTitle) {
    setDrafts((prev) => prev.map((d) => (d.id === draftId ? { ...d, title: newTitle } : d)));
  }

  function handleTitleBlur(draftId, title) {
    api.patchSession(draftId, { title }).catch(() => {});
  }

  async function handleDelete(draftId) {
    if (!window.confirm("Are you sure you want to delete this draft? Action cannot be undone.")) return;
    try {
      await api.deleteSession(draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 24px", position: "relative" }}>
      {authEnabled && (
        <div style={{ position: "absolute", top: 0, right: 24 }}>
          <button
            onClick={onSignOut}
            style={{ fontSize: 12, color: T.textFaint, background: "none", border: "none", cursor: "pointer", paddingTop: 16 }}
          >
            Sign out
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Drafts</h1>
        <button
          onClick={handleNewDraft}
          disabled={creating}
          style={{
            padding: "10px 22px",
            fontSize: 14,
            fontWeight: 700,
            background: T.text,
            color: T.onRed,
            border: "none",
            borderRadius: 6,
            cursor: creating ? "default" : "pointer",
            opacity: creating ? 0.6 : 1,
          }}
        >
          {creating ? "Creating…" : "New Draft"}
        </button>
      </div>

      {loading && <div style={{ color: T.textMuted }}>Loading…</div>}
      {error && <div style={{ color: T.text, fontSize: 14 }}>{error}</div>}
      {!loading && !error && drafts.length === 0 && (
        <div style={{ color: T.textFaint, fontSize: 15 }}>
          No drafts yet. Press New Draft to get started.
        </div>
      )}

      {drafts.map((draft) => (
        <div
          key={draft.id}
          style={{
            display: "flex",
            alignItems: "center",
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            marginBottom: 10,
            padding: "14px 16px",
            gap: 12,
            background: T.surface,
          }}
        >
          <input
            value={draft.title || ""}
            placeholder="Untitled draft"
            onChange={(e) => handleTitleChange(draft.id, e.target.value)}
            onBlur={(e) => handleTitleBlur(draft.id, e.target.value)}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: 15,
              color: T.text,
              fontFamily: "inherit",
              background: "transparent",
              minWidth: 0,
            }}
          />
          <button
            onClick={() => onOpen(draft)}
            style={{
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 700,
              background: T.text,
              color: T.onRed,
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            View Draft
          </button>
          <button
            onClick={() => handleDelete(draft.id)}
            title="Delete draft"
            style={{
              padding: "8px 10px",
              fontSize: 14,
              fontWeight: 700,
              background: "transparent",
              color: T.textFaint,
              border: `1px solid ${T.border}`,
              borderRadius: 5,
              cursor: "pointer",
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

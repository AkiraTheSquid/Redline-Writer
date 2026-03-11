import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase.js";
import { setAccessToken } from "./api.js";
import AuthScreen from "./components/AuthScreen.jsx";
import DraftsScreen from "./components/DraftsScreen.jsx";
import WritingScreen from "./components/WritingScreen.jsx";

// Auth is only active in production (when Supabase env vars are present)
const AUTH_ENABLED = !!supabase;
const AUTH_STATUS_DELAY_MS = 10000;

export default function App() {
  const [view, setView] = useState("drafts");
  const [activeDraft, setActiveDraft] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(AUTH_ENABLED);
  const [authStatus, setAuthStatus] = useState("");

  useEffect(() => {
    if (!AUTH_ENABLED) return;

    let cancelled = false;
    const statusTimer = window.setTimeout(() => {
      if (!cancelled) {
        setAuthStatus("Still connecting to authentication. You can wait a moment and it should finish signing you in.");
      }
    }, AUTH_STATUS_DELAY_MS);

    async function initializeAuth() {
      try {
        const sessionResult = await supabase.auth.getSession();
        if (cancelled) return;
        const session = sessionResult?.data?.session ?? null;
        setUser(session?.user ?? null);
        setAccessToken(session?.access_token ?? null);
        setAuthStatus("");
      } catch (error) {
        if (cancelled) return;
        setUser(null);
        setAccessToken(null);
        setAuthStatus("Authentication is taking longer than expected.");
      } finally {
        window.clearTimeout(statusTimer);
        if (!cancelled) setAuthLoading(false);
      }
    }

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.clearTimeout(statusTimer);
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
      setAuthStatus("");
      setAuthLoading(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(statusTimer);
      subscription.unsubscribe();
    };
  }, []);

  if (authLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, height: "100%", color: "#888", fontSize: 15 }}>
        <div>Loading…</div>
        {authStatus && <div style={{ fontSize: 13 }}>{authStatus}</div>}
      </div>
    );
  }

  if (AUTH_ENABLED && !user) {
    return <AuthScreen initialError={authStatus} />;
  }

  function handleSignOut() {
    if (supabase) supabase.auth.signOut();
  }

  function handleOpenDraft(draft) {
    setActiveDraft(draft);
    setView("writing");
  }

  function handleWritingEnd() {
    setActiveDraft(null);
    setView("drafts");
  }

  return (
    <div style={{ height: "100%" }}>
      {view === "drafts" && (
        <DraftsScreen
          onOpen={handleOpenDraft}
          onSignOut={handleSignOut}
          authEnabled={AUTH_ENABLED}
        />
      )}
      {view === "writing" && activeDraft && (
        <WritingScreen draft={activeDraft} onEnd={handleWritingEnd} />
      )}
    </div>
  );
}

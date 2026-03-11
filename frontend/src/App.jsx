import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase.js";
import { setAccessToken } from "./api.js";
import AuthScreen from "./components/AuthScreen.jsx";
import DraftsScreen from "./components/DraftsScreen.jsx";
import WritingScreen from "./components/WritingScreen.jsx";

// Auth is only active in production (when Supabase env vars are present)
const AUTH_ENABLED = !!supabase;
const AUTH_INIT_TIMEOUT_MS = 20000;

export default function App() {
  const [view, setView] = useState("drafts");
  const [activeDraft, setActiveDraft] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(AUTH_ENABLED);
  const [authStatus, setAuthStatus] = useState("");

  useEffect(() => {
    if (!AUTH_ENABLED) return;

    let cancelled = false;

    async function initializeAuth() {
      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error("Authentication startup timed out.")), AUTH_INIT_TIMEOUT_MS);
          }),
        ]);
        if (cancelled) return;
        const session = sessionResult?.data?.session ?? null;
        setUser(session?.user ?? null);
        setAccessToken(session?.access_token ?? null);
        setAuthStatus("");
      } catch (error) {
        if (cancelled) return;
        setUser(null);
        setAccessToken(null);
        setAuthStatus(
          error instanceof Error && error.message === "Authentication startup timed out."
            ? "Still connecting to authentication. You can wait a moment and it should finish signing you in."
            : "Authentication is taking longer than expected."
        );
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
      setAuthStatus("");
      setAuthLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (authLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#888", fontSize: 15 }}>
        Loading…
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

import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase.js";
import { setAccessToken } from "./api.js";
import AuthScreen from "./components/AuthScreen.jsx";
import DraftsScreen from "./components/DraftsScreen.jsx";
import WritingScreen from "./components/WritingScreen.jsx";

// Auth is only active in production (when Supabase env vars are present)
const AUTH_ENABLED = !!supabase;

export default function App() {
  const [view, setView] = useState("drafts");
  const [activeDraft, setActiveDraft] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(AUTH_ENABLED);

  useEffect(() => {
    if (!AUTH_ENABLED) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#888", fontSize: 15 }}>
        Loading…
      </div>
    );
  }

  if (AUTH_ENABLED && !user) {
    return <AuthScreen />;
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

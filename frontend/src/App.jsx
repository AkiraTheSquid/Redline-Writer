import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase.js";
import { setAccessToken } from "./api.js";
import AuthScreen from "./components/AuthScreen.jsx";
import SetupScreen from "./components/SetupScreen.jsx";
import WritingScreen from "./components/WritingScreen.jsx";
import SessionHistory from "./components/SessionHistory.jsx";

// Auth is only active in production (when Supabase env vars are present)
const AUTH_ENABLED = !!supabase;

export default function App() {
  const [view, setView] = useState("setup");
  const [sessionConfig, setSessionConfig] = useState(null);
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

  return (
    <div style={{ height: "100%" }}>
      {AUTH_ENABLED && view === "setup" && (
        <div style={{ position: "absolute", top: 14, right: 18 }}>
          <button
            onClick={handleSignOut}
            style={{ fontSize: 12, color: "#aaa", background: "none", border: "none", cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      )}
      {view === "setup" && (
        <SetupScreen onStart={(config) => { setSessionConfig(config); setView("writing"); }} onHistory={() => setView("history")} />
      )}
      {view === "writing" && sessionConfig && (
        <WritingScreen config={sessionConfig} onEnd={() => setView("history")} />
      )}
      {view === "history" && (
        <SessionHistory onNewSession={() => { setSessionConfig(null); setView("setup"); }} />
      )}
    </div>
  );
}

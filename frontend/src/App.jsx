import { useState } from "react";
import SetupScreen from "./components/SetupScreen.jsx";
import WritingScreen from "./components/WritingScreen.jsx";
import SessionHistory from "./components/SessionHistory.jsx";

// view: 'setup' | 'writing' | 'history'
export default function App() {
  const [view, setView] = useState("setup");
  const [sessionConfig, setSessionConfig] = useState(null);

  function handleStart(config) {
    setSessionConfig(config);
    setView("writing");
  }

  function handleSessionEnd() {
    setView("history");
  }

  function handleNewSession() {
    setSessionConfig(null);
    setView("setup");
  }

  return (
    <div style={{ height: "100%" }}>
      {view === "setup" && (
        <SetupScreen onStart={handleStart} onHistory={() => setView("history")} />
      )}
      {view === "writing" && sessionConfig && (
        <WritingScreen config={sessionConfig} onEnd={handleSessionEnd} />
      )}
      {view === "history" && (
        <SessionHistory onNewSession={handleNewSession} />
      )}
    </div>
  );
}

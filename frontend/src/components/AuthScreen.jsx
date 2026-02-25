import { useState } from "react";
import { supabase } from "../lib/supabase.js";

const S = {
  page: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    background: "#fff",
  },
  card: {
    width: 400,
    padding: "40px 36px",
    border: "1px solid #ddd",
    borderRadius: 8,
    boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
  },
  title: { fontSize: 26, fontWeight: 700, marginBottom: 4, letterSpacing: "-0.5px" },
  subtitle: { fontSize: 13, color: "#888", marginBottom: 28 },
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
  btn: {
    marginTop: 24,
    width: "100%",
    padding: "12px 0",
    fontSize: 15,
    fontWeight: 700,
    background: "#FF2020",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  toggle: {
    marginTop: 16,
    width: "100%",
    padding: "9px 0",
    fontSize: 13,
    fontWeight: 500,
    background: "transparent",
    color: "#888",
    border: "1px solid #ddd",
    borderRadius: 6,
    cursor: "pointer",
  },
  error: { color: "#d00", fontSize: 13, marginTop: 10 },
};

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let result;
      if (mode === "login") {
        result = await supabase.auth.signInWithPassword({ email, password });
      } else {
        result = await supabase.auth.signUp({ email, password });
      }
      if (result.error) setError(result.error.message);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.title}>Redline Writer</div>
        <div style={S.subtitle}>
          {mode === "login" ? "Sign in to your account." : "Create a new account."}
        </div>
        <form onSubmit={handleSubmit}>
          <label style={S.label}>Email</label>
          <input
            style={S.input}
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label style={S.label}>Password</label>
          <input
            style={S.input}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div style={S.error}>{error}</div>}
          <button style={S.btn} type="submit" disabled={loading}>
            {loading ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          style={S.toggle}
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
        >
          {mode === "login" ? "No account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

// Verify a Supabase JWT and return the user, or null if invalid/missing.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export async function getUser(req) {
  const auth = req.headers["authorization"] || req.headers["Authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

import { dbFetch } from "../../_db.js";
import { getUser } from "../../_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query;
  const { outcome, content = "", organizer_text = "", word_count = 0, wpm_at_end = 0, elapsed_sec = 0 } = req.body;

  try {
    const rows = await dbFetch(`/sessions?id=eq.${id}&user_id=eq.${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        outcome: "draft",  // drafts always persist; content already empty if session was deleted
        content,
        organizer_text,
        word_count,
        wpm_at_end,
        elapsed_sec,
        completed_at: new Date().toISOString(),
      }),
    });
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Session not found" });
    return res.status(200).json(rows[0]);
  } catch (e) {
    res.status(e.status || 500).json(e.body || { error: String(e) });
  }
}

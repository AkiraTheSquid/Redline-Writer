import { dbFetch } from "../_db.js";
import { getUser } from "../_auth.js";

export default async function handler(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    if (req.method === "POST") {
      const {
        duration_min = 20, min_wpm = 10, reminder_interval_min = 0,
        organizer_text = "", outcome = "draft", title = "", content = "",
      } = req.body;
      const rows = await dbFetch("/sessions", {
        method: "POST",
        body: JSON.stringify({ duration_min, min_wpm, reminder_interval_min, organizer_text, outcome, title, content, user_id: user.id }),
      });
      return res.status(201).json(Array.isArray(rows) ? rows[0] : rows);
    }

    if (req.method === "GET") {
      const rows = await dbFetch(`/sessions?outcome=eq.draft&user_id=eq.${user.id}&order=created_at.desc&select=*`);
      return res.status(200).json(rows);
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(e.status || 500).json(e.body || { error: String(e) });
  }
}

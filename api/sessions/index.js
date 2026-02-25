import { dbFetch } from "../_db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const { duration_min, min_wpm, reminder_interval_min = 0, organizer_text = "" } = req.body;
      const rows = await dbFetch("/sessions", {
        method: "POST",
        body: JSON.stringify({ duration_min, min_wpm, reminder_interval_min, organizer_text, outcome: "active" }),
      });
      return res.status(201).json(Array.isArray(rows) ? rows[0] : rows);
    }

    if (req.method === "GET") {
      const rows = await dbFetch("/sessions?outcome=neq.active&order=created_at.desc&select=*");
      return res.status(200).json(rows);
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(e.status || 500).json(e.body || { error: String(e) });
  }
}

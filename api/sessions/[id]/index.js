import { dbFetch } from "../../_db.js";
import { getUser } from "../../_auth.js";

export default async function handler(req, res) {
  console.log("[sessions:id]", req.method, req.url);
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query;

  try {
    if (req.method === "GET") {
      const rows = await dbFetch(`/sessions?id=eq.${id}&user_id=eq.${user.id}&select=*&limit=1`);
      if (!rows || rows.length === 0) return res.status(404).json({ error: "Session not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "PATCH") {
      const allowed = ["content", "organizer_text", "word_count", "wpm_at_end", "elapsed_sec", "title", "outcome", "duration_min", "min_wpm"];
      const patch = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) patch[key] = req.body[key];
      }
      const rows = await dbFetch(`/sessions?id=eq.${id}&user_id=eq.${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!rows || rows.length === 0) return res.status(404).json({ error: "Session not found" });
      return res.status(200).json(rows[0]);
    }

    if (req.method === "DELETE") {
      await dbFetch(`/sessions?id=eq.${id}&user_id=eq.${user.id}`, { method: "DELETE" });
      return res.status(204).end();
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(e.status || 500).json(e.body || { error: String(e) });
  }
}

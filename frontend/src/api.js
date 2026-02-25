const BASE = "";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json();
}

export const api = {
  createSession: (body) =>
    apiFetch("/sessions", { method: "POST", body: JSON.stringify(body) }),

  patchSession: (id, body) =>
    apiFetch(`/sessions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  endSession: (id, body) =>
    apiFetch(`/sessions/${id}/end`, { method: "POST", body: JSON.stringify(body) }),

  listSessions: () => apiFetch("/sessions"),

  getSession: (id) => apiFetch(`/sessions/${id}`),
};

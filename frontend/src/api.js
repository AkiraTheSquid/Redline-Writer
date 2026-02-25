let _accessToken = null;

export function setAccessToken(token) {
  _accessToken = token;
}

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (_accessToken) headers["Authorization"] = `Bearer ${_accessToken}`;
  const res = await fetch(path, { ...options, headers });
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

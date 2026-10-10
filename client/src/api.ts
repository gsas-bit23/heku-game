const q = new URLSearchParams(location.search);
if (q.get("server")) localStorage.setItem("heku-server", q.get("server")!);
export const SERVER = (q.get("server") || import.meta.env.VITE_SERVER_URL || localStorage.getItem("heku-server") || "http://localhost:2567").replace(/\/$/, "");
export const WS = SERVER.replace(/^http/, "ws");
export type Character = { userId: string; name: string; color: string; variant: string };
export async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const r = await fetch(SERVER + path, { ...init, headers: { "content-type": "application/json", ...(init.token ? { authorization: "Bearer " + init.token } : {}) } });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j as T;
}

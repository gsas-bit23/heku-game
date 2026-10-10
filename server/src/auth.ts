import crypto from "node:crypto"; import { Router } from "express"; import { verifyMessage, isAddress, getAddress } from "viem";
import type { CharacterStore } from "./store.js"; import { DROID_COLORS, DROID_VARIANTS } from "../../shared/map.js";
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const nonces = new Map<string, { nonce: string; exp: number }>();
export const loginMessage = (addr: string, nonce: string) => `Heku Droid login\n\nSign to prove you own this wallet. No transaction, no gas.\n\nAddress: ${addr}\nChain: Robinhood Chain Testnet (46630)\nNonce: ${nonce}`;
export function issue(userId: string, ttl = 7 * 864e5) { const p = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + ttl })).toString("base64url"); return p + "." + crypto.createHmac("sha256", SECRET).update(p).digest("base64url"); }
export function verifyToken(t?: string): string | null {
  if (!t) return null; const [p, s] = t.split("."); if (!p || !s) return null;
  const exp = crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
  if (s.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp))) return null;
  const o = JSON.parse(Buffer.from(p, "base64url").toString()); return o.e > Date.now() ? o.u : null;
}
export function authRoutes(store: CharacterStore) {
  const r = Router();
  r.get("/auth/nonce", (q, s) => { const a = String(q.query.address || ""); if (!isAddress(a)) return s.status(400).json({ error: "bad address" });
    const addr = getAddress(a); const nonce = crypto.randomBytes(16).toString("hex"); nonces.set(addr, { nonce, exp: Date.now() + 5 * 60e3 }); s.json({ message: loginMessage(addr, nonce) }); });
  r.post("/auth/verify", async (q, s) => { try { const { address, signature } = q.body || {}; if (!isAddress(address)) return s.status(400).json({ error: "bad address" });
    const addr = getAddress(address); const n = nonces.get(addr); if (!n || n.exp < Date.now()) return s.status(400).json({ error: "nonce expired" });
    const ok = await verifyMessage({ address: addr, message: loginMessage(addr, n.nonce), signature }); nonces.delete(addr);
    if (!ok) return s.status(401).json({ error: "bad signature" }); s.json({ token: issue("w:" + addr.toLowerCase()), userId: "w:" + addr.toLowerCase() }); } catch { s.status(400).json({ error: "verify failed" }); } });
  r.post("/auth/guest", (_q, s) => { const id = "g:" + crypto.randomBytes(6).toString("hex"); s.json({ token: issue(id, 864e5), userId: id }); });
  const me = (q: { headers: { authorization?: string } }) => verifyToken(q.headers.authorization?.replace(/^Bearer /, ""));
  r.get("/character", async (q, s) => { const u = me(q); if (!u) return s.status(401).end(); s.json({ character: await store.get(u) }); });
  r.post("/character", async (q, s) => { const u = me(q); if (!u) return s.status(401).end();
    const name = String(q.body?.name || "").trim(); const color = String(q.body?.color); const variant = String(q.body?.variant);
    if (!/^[A-Za-z0-9_\- ]{3,16}$/.test(name)) return s.status(400).json({ error: "Name: 3-16 letters, numbers, _ -" });
    if (!DROID_COLORS.includes(color) || !(DROID_VARIANTS as readonly string[]).includes(variant)) return s.status(400).json({ error: "bad look" });
    if (await store.nameTaken(name, u)) return s.status(409).json({ error: "Name taken" });
    const c = { userId: u, name, color, variant, createdAt: (await store.get(u))?.createdAt ?? Date.now() }; await store.save(c); s.json({ character: c }); });
  return r;
}

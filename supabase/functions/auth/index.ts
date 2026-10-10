// Heku Droid auth + characters. Custom session tokens (HMAC-SHA256, secret in public.app_secrets, service-role only).
// Actions (POST JSON {action,...}): nonce{address} | verify{address,signature} | guest | me{token} | save{token,callsign,chassis,color}
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { verifyMessage, isAddress, getAddress } from "npm:viem@2.21.25";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const COLORS = ["#ffb340", "#4ff2ff", "#ff3b4a", "#9bd36a", "#c08cff", "#f1e3d3"], CHASSIS = ["astronautA", "astronautB"];
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
let key: CryptoKey | null = null;
async function hmacKey() { if (key) return key; const { data } = await db.from("app_secrets").select("v").eq("k", "session_hmac").single();
  key = await crypto.subtle.importKey("raw", new TextEncoder().encode(data!.v), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); return key; }
async function issue(u: string, ttlMs: number) { const p = b64u(new TextEncoder().encode(JSON.stringify({ u, e: Date.now() + ttlMs })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(p))); return p + "." + b64u(sig); }
async function check(t?: string): Promise<string | null> { try { const [p, s] = String(t || "").split("."); if (!p || !s) return null;
  const sig = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  if (!(await crypto.subtle.verify("HMAC", await hmacKey(), sig, new TextEncoder().encode(p)))) return null;
  const o = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))); return o.e > Date.now() ? o.u : null; } catch { return null; } }
const msg = (a: string, n: string) => `Heku Droid login\n\nSign to prove you own this wallet. No transaction, no gas.\n\nAddress: ${a}\nChain: Robinhood Chain Testnet (46630)\nNonce: ${n}`;
const pub = (c: Record<string, string>) => c && { userId: c.user_id, name: c.callsign, variant: c.chassis, color: c.color };
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "nonce": { if (!isAddress(b.address)) return json({ error: "bad address" }, 400); const a = getAddress(b.address); const n = hex(16);
        await db.from("auth_nonces").upsert({ address: a, nonce: n, expires_at: new Date(Date.now() + 5 * 60e3).toISOString() }); return json({ message: msg(a, n) }); }
      case "verify": { if (!isAddress(b.address)) return json({ error: "bad address" }, 400); const a = getAddress(b.address);
        const { data: row } = await db.from("auth_nonces").select("*").eq("address", a).maybeSingle(); await db.from("auth_nonces").delete().eq("address", a);
        if (!row || new Date(row.expires_at).getTime() < Date.now()) return json({ error: "nonce expired" }, 400);
        const ok = await verifyMessage({ address: a, message: msg(a, row.nonce), signature: b.signature }).catch(() => false); if (!ok) return json({ error: "bad signature" }, 401);
        const u = "w:" + a.toLowerCase(); return json({ token: await issue(u, 7 * 864e5), userId: u }); }
      case "guest": { const u = "g:" + hex(6); return json({ token: await issue(u, 864e5), userId: u }); }
      case "me": { const u = await check(b.token); if (!u) return json({ error: "unauthorized" }, 401);
        const { data } = await db.from("characters").select("*").eq("user_id", u).maybeSingle(); return json({ userId: u, character: data ? pub(data) : null }); }
      case "save": { const u = await check(b.token); if (!u) return json({ error: "unauthorized" }, 401);
        const name = String(b.callsign || "").trim(); if (!/^[A-Za-z0-9_\- ]{3,16}$/.test(name)) return json({ error: "Name: 3-16 letters, numbers, _ -" }, 400);
        if (!COLORS.includes(b.color) || !CHASSIS.includes(b.chassis)) return json({ error: "bad look" }, 400);
        const { data, error } = await db.from("characters").upsert({ user_id: u, callsign: name, chassis: b.chassis, color: b.color, updated_at: new Date().toISOString() }).select().single();
        if (error) return json({ error: error.code === "23505" ? "Name taken" : "save failed" }, error.code === "23505" ? 409 : 500); return json({ character: pub(data) }); }
      default: return json({ error: "unknown action" }, 400);
    }
  } catch (e) { console.error(e); return json({ error: "server error" }, 500); }
});

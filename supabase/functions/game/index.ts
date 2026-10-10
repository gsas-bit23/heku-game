// Heku Droid survival state (Phase 2). Server-authoritative; time-based state derived from timestamps (no ticking).
// POST {action, token, ...}: state | order{item,qty} | collect{rocket} | use{id} | respawn | dev_warp{seconds} (guests only, when app_secrets.dev_warp='on')
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ITEMS, ECON, type ItemKey } from "./catalog.ts";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const H = 3600e3;
let key: CryptoKey | null = null;
async function secret(k: string) { const { data } = await db.from("app_secrets").select("v").eq("k", k).maybeSingle(); return data?.v as string | undefined; }
async function check(t?: string): Promise<string | null> { try { const [p, s] = String(t || "").split("."); if (!p || !s) return null;
  key ??= await crypto.subtle.importKey("raw", new TextEncoder().encode(await secret("session_hmac")), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sig = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  if (!(await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(p)))) return null;
  const o = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))); return o.e > Date.now() ? o.u : null; } catch { return null; } }

// ---- deterministic rocket schedule: launches at 06:00 and 18:00 UTC, 2h flight ----
type Slot = { id: string; launch_at: string; land_at: string };
function slotsAround(now: number, back = 2, fwd = 6): Slot[] {
  const out: Slot[] = []; const d0 = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) - 864e5;
  for (let d = 0; d < 6; d++) ECON.LAUNCH_UTC_H.forEach((h, i) => { const t = d0 + d * 864e5 + h * H; out.push({ id: new Date(d0 + d * 864e5).toISOString().slice(0, 10) + "-" + "AB"[i], launch_at: new Date(t).toISOString(), land_at: new Date(t + ECON.FLIGHT_H * H).toISOString() }); });
  const next = out.findIndex(s => Date.parse(s.launch_at) > now); return out.slice(Math.max(0, next - back), next + fwd);
}

// ---- oxygen: piecewise drain between item expiry events ----
type Inv = { id: string; item: ItemKey; expires_at: string };
const rate = (inv: Inv[], t: number) => { const has = (k: string) => inv.some(i => i.item === k && Date.parse(i.expires_at) > t);
  return ECON.BASE_DRAIN_PER_H * (has("food") ? 1 : 2) * (has("water") ? 1 : 1.5) * (has("suit") ? 0.5 : 1) / H; };
function oxygenAt(o2: number, from: number, to: number, inv: Inv[]) {
  const ev = [...new Set(inv.map(i => Date.parse(i.expires_at)).filter(t => t > from && t < to))].sort((a, b) => a - b).concat(to);
  let t = from, o = o2;
  for (const e of ev) { const r = rate(inv, t); const need = o / r; if (t + need <= e) return { o: 0, deadAt: t + need }; o -= r * (e - t); t = e; }
  return { o: Math.max(0, o), deadAt: null as number | null };
}

async function load(u: string) {
  let { data: ps } = await db.from("player_state").select("*").eq("user_id", u).maybeSingle();
  if (!ps) { // one-time starter grant (wallets and guests)
    const now = new Date(); await db.from("player_state").insert({ user_id: u, paper: ECON.STARTER_PAPER, starter_granted: true, o2_at: now.toISOString() });
    await db.from("inventory").insert((["o2", "o2", "water", "food", "suit"] as ItemKey[]).map(item => ({ user_id: u, item, expires_at: new Date(now.getTime() + ITEMS[item].lifeH * H).toISOString() })));
    ps = (await db.from("player_state").select("*").eq("user_id", u).single()).data;
  }
  const now = Date.now() + ps.time_offset_s * 1000;
  const { data: inv } = await db.from("inventory").select("id,item,expires_at").eq("user_id", u);
  return settle(u, ps, (inv || []) as Inv[], now);
}
async function settle(u: string, ps: Record<string, any>, inv: Inv[], now: number) {
  let oxygen = ps.oxygen, dead = ps.dead, died_at = ps.died_at;
  if (!dead) { const r = oxygenAt(ps.oxygen, Date.parse(ps.o2_at), now, inv);
    if (r.deadAt) { dead = true; died_at = new Date(r.deadAt).toISOString(); oxygen = 0;
      const alive = inv.filter(i => Date.parse(i.expires_at) > r.deadAt!);
      await db.from("crates").insert({ user_id: u, items: alive.map(i => i.item) }); // Phase 3: lootable death crate
      await db.from("inventory").delete().eq("user_id", u); inv = [];
    } else oxygen = r.o; }
  const gone = inv.filter(i => Date.parse(i.expires_at) <= now); if (gone.length) await db.from("inventory").delete().in("id", gone.map(i => i.id));
  inv = inv.filter(i => Date.parse(i.expires_at) > now);
  await db.from("player_state").update({ oxygen, o2_at: new Date(now).toISOString(), dead, died_at }).eq("user_id", u);
  return { ps: { ...ps, oxygen, dead, died_at }, inv, now, expired: gone.map(g => g.item) };
}

async function view(u: string, s: Awaited<ReturnType<typeof load>>) {
  const slots = slotsAround(s.now); const { data: rows } = await db.from("rockets").select("*").in("id", slots.map(x => x.id));
  const { data: ords } = await db.from("orders").select("rocket_id,user_id").in("rocket_id", slots.map(x => x.id));
  const { data: mine } = await db.from("orders").select("id,rocket_id,item,qty,units,cost,status,fuel_paid").eq("user_id", u).order("created_at", { ascending: false }).limit(30);
  const rockets = slots.map(sl => { const r = rows?.find(x => x.id === sl.id); const load = r?.load ?? 0; const players = new Set((ords || []).filter(o => o.rocket_id === sl.id).map(o => o.user_id)).size;
    const st = s.now < Date.parse(sl.launch_at) ? "boarding" : s.now < Date.parse(sl.land_at) ? "in flight" : "landed";
    return { ...sl, capacity: r?.capacity ?? ECON.CAPACITY, load, players, status: st, fuel: ECON.FUEL_BASE + ECON.FUEL_PER_UNIT * load, share: Math.ceil((ECON.FUEL_BASE + ECON.FUEL_PER_UNIT * load) / Math.max(1, players)) }; });
  return { now: new Date(s.now).toISOString(), timeOffset: s.ps.time_offset_s, player: { oxygen: s.ps.oxygen, paper: s.ps.paper, dead: s.ps.dead, diedAt: s.ps.died_at, drainPerH: rate(s.inv, s.now) * H },
    inventory: s.inv, orders: mine || [], rockets, expired: s.expired, econ: ECON, devWarp: (await secret("dev_warp")) === "on" && u.startsWith("g:") };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const b = await req.json().catch(() => ({})); const u = await check(b.token); if (!u) return json({ error: "unauthorized" }, 401);
  try {
    let s = await load(u); let msg = "";
    switch (b.action) {
      case "state": break;
      case "order": { const it = ITEMS[b.item as ItemKey]; const qty = Math.floor(+b.qty); if (!it || !(qty >= 1 && qty <= 10)) return json({ error: "bad order" }, 400);
        if (s.ps.dead) return json({ error: "You are dead — respawn first" }, 400);
        const cand = slotsAround(s.now, 0, 6).filter(x => Date.parse(x.launch_at) - ECON.CUTOFF_MIN * 60e3 > s.now);
        const { data, error } = await db.rpc("book_order", { p_user: u, p_item: b.item, p_qty: qty, p_units: it.cargo * qty, p_cost: it.price * qty, p_slots: cand });
        if (error) return json({ error: error.message.includes("full") ? "All upcoming rockets are full" : "order failed" }, 409); if (data.error) return json({ error: data.error }, 400);
        msg = `Booked on rocket ${data.rocket}${data.rocket !== cand[0].id ? " (earlier rockets full — queued)" : ""}`; break; }
      case "collect": { const life = Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.lifeH]));
        const { data, error } = await db.rpc("collect_rocket", { p_user: u, p_rocket: String(b.rocket), p_now: new Date(s.now).toISOString(), p_base: ECON.FUEL_BASE, p_per_unit: ECON.FUEL_PER_UNIT, p_life_h: life });
        if (error) return json({ error: "collect failed" }, 500); if (data.error) return json({ error: data.error }, 400);
        msg = `Collected ${data.items} items — paid ${data.fuel} Paper fuel share (${data.players} colonists, ${data.load} cargo units)`; break; }
      case "use": { const it = s.inv.find(i => i.id === b.id); if (!it || s.ps.dead) return json({ error: "Not usable" }, 400);
        const gain = it.item === "o2" ? 45 : it.item === "medkit" ? 25 : 0; if (!gain) return json({ error: "Passive item — just keep it in inventory" }, 400);
        const { data: del } = await db.from("inventory").delete().eq("id", it.id).eq("user_id", u).select("id"); if (!del?.length) return json({ error: "Already used" }, 409);
        const o = Math.min(100, s.ps.oxygen + gain); await db.from("player_state").update({ oxygen: o, o2_at: new Date(s.now).toISOString() }).eq("user_id", u);
        msg = `${ITEMS[it.item].name} used: O₂ ${s.ps.oxygen.toFixed(1)}% → ${o.toFixed(1)}%`; break; }
      case "respawn": { if (!s.ps.dead) return json({ error: "Not dead" }, 400);
        await db.from("player_state").update({ dead: false, died_at: null, oxygen: 60, o2_at: new Date(s.now).toISOString() }).eq("user_id", u); msg = "Respawned at the Hab with 60% O₂"; break; }
      case "dev_warp": { if (!u.startsWith("g:") || (await secret("dev_warp")) !== "on") return json({ error: "time warp disabled" }, 403);
        const sec = Math.floor(+b.seconds); if (!(sec > 0 && sec <= 2 * 86400)) return json({ error: "bad seconds" }, 400);
        await db.from("player_state").update({ time_offset_s: s.ps.time_offset_s + sec }).eq("user_id", u); msg = `⏩ warped ${Math.round(sec / 60)} min (guest test account only)`; break; }
      default: return json({ error: "unknown action" }, 400);
    }
    if (b.action !== "state") s = await load(u);
    return json({ ...(await view(u, s)), msg });
  } catch (e) { console.error(e); return json({ error: "server error" }, 500); }
});

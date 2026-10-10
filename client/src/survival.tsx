import { useCallback, useEffect, useState } from "react";
import { SUPABASE_URL, SUPABASE_KEY } from "./api";
import { ITEMS, type ItemKey } from "../../shared/catalog";
export type Rocket = { id: string; launch_at: string; land_at: string; capacity: number; load: number; players: number; status: string; fuel: number; share: number };
export type Order = { id: string; rocket_id: string; item: ItemKey; qty: number; units: number; cost: number; status: string; fuel_paid: number | null };
export type GState = { now: string; timeOffset: number; player: { oxygen: number; paper: number; dead: boolean; drainPerH: number }; inventory: { id: string; item: ItemKey; expires_at: string }[]; orders: Order[]; rockets: Rocket[]; expired: string[]; devWarp: boolean; msg?: string };
async function call(token: string, action: string, extra: Record<string, unknown> = {}): Promise<GState> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/game`, { method: "POST", headers: { "content-type": "application/json", apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` }, body: JSON.stringify({ action, token, ...extra }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j;
}
export function useSurvival(token: string) {
  const [s, setS] = useState<GState | null>(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [at, setAt] = useState(Date.now()); const [, force] = useState(0);
  const apply = (g: GState) => { setS(g); setAt(Date.now()); if (g.msg) setMsg(g.msg); if (g.expired?.length) setMsg(`Expired and vanished: ${g.expired.map(k => ITEMS[k as ItemKey]?.name).join(", ")}`); };
  const act = useCallback(async (a: string, extra: Record<string, unknown> = {}) => { setBusy(true); try { apply(await call(token, a, extra)); } catch (e) { setMsg("✗ " + (e as Error).message); } finally { setBusy(false); } }, [token]);
  useEffect(() => { act("state"); const p = setInterval(() => act("state"), 20000); const t = setInterval(() => force(x => x + 1), 1000); return () => { clearInterval(p); clearInterval(t); }; }, [act]);
  const el = (Date.now() - at) / 1000; const now = s ? Date.parse(s.now) + el * 1000 : Date.now();
  const oxygen = s ? (s.player.dead ? 0 : Math.max(0, s.player.oxygen - s.player.drainPerH * el / 3600)) : 100;
  useEffect(() => { if (s && !s.player.dead && oxygen <= 0 && !busy) act("state"); }, [oxygen <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return { s, msg, setMsg, busy, act, now, oxygen };
}
export const fmtDur = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(x).padStart(2, "0")}s`; };
const row: React.CSSProperties = { display: "grid", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #ffffff10", fontSize: 13 };
type Sv = ReturnType<typeof useSurvival>;
export function ShopPanel({ sv }: { sv: Sv }) {
  const [q, setQ] = useState<Record<string, number>>({}); const s = sv.s; if (!s) return null;
  const open = s.rockets.filter(r => Date.parse(r.launch_at) - 10 * 60e3 > sv.now);
  return <div><div className="tag">paper {s.player.paper} · first open rocket: {open[0]?.id} ({open[0]?.load}/{open[0]?.capacity}) · fuel share now ≈ {open[0] ? Math.ceil(open[0].fuel / Math.max(1, open[0].players + 1)) : "—"} ₱</div>
    {(Object.keys(ITEMS) as ItemKey[]).map(k => { const it = ITEMS[k]; const n = q[k] || 1; return <div key={k} style={{ ...row, gridTemplateColumns: "1fr 70px 60px 90px" }}>
      <span><b>{it.name}</b><br /><span style={{ opacity: .55, fontSize: 11 }}>{it.desc} · {it.cargo} cu · lasts {it.lifeH}h</span></span>
      <span>{it.price * n} ₱</span><input type="number" min={1} max={10} value={n} onChange={e => setQ({ ...q, [k]: Math.max(1, Math.min(10, +e.target.value)) })} style={{ width: 50 }} />
      <button className="btn" data-testid={`order-${k}`} disabled={sv.busy || s.player.paper < it.price * n} onClick={() => sv.act("order", { item: k, qty: n })}>order</button></div>; })}
    <p style={{ fontSize: 11, opacity: .5 }}>Orders go to the first rocket with cargo room (cutoff 10 min before launch); if full, the next one. Fuel = 60 + 3/cargo unit, split equally between everyone on that rocket, paid when you collect.</p></div>;
}
export function LaunchPanel({ sv }: { sv: Sv }) {
  const s = sv.s; if (!s) return null;
  return <div>{s.devWarp && <button className="btn c" data-testid="warp" style={{ marginBottom: 10 }} onClick={() => { const nx = s.rockets.map(r => [Date.parse(r.launch_at), Date.parse(r.land_at)]).flat().filter(t => t > sv.now).sort((a, b) => a - b)[0]; if (nx) sv.act("dev_warp", { seconds: Math.ceil((nx - sv.now) / 1000) + 5 }); }}>⏩ dev: warp to next rocket event (guest test only)</button>}
    {s.rockets.slice(0, 5).map(r => { const mine = s.orders.filter(o => o.rocket_id === r.id); const pending = mine.filter(o => o.status === "queued");
      const st = sv.now < Date.parse(r.launch_at) ? "boarding" : sv.now < Date.parse(r.land_at) ? "in flight" : "landed";
      return <div key={r.id} style={{ ...row, gridTemplateColumns: "120px 1fr 150px" }}>
        <span><b style={{ color: "#ffb340" }}>{r.id}</b><br /><span className="tag" style={{ color: st === "landed" ? "#4ff2ff" : st === "in flight" ? "#ffb340" : undefined }}>{st}</span></span>
        <span><div style={{ height: 5, background: "#ffffff10" }}><div style={{ width: r.load / r.capacity * 100 + "%", height: "100%", background: r.load >= r.capacity ? "#ff3b4a" : "#ffb340" }} /></div>
          <span style={{ fontSize: 11, opacity: .7 }}>{r.load}/{r.capacity} cu · {r.players} colonists · fuel {r.fuel} ₱ → {r.share} ₱ each · {st === "boarding" ? "launch in " + fmtDur(Date.parse(r.launch_at) - sv.now) : st === "in flight" ? "lands in " + fmtDur(Date.parse(r.land_at) - sv.now) : "landed"}</span>
          {mine.length > 0 && <div style={{ fontSize: 11, color: "#4ff2ff" }}>yours: {mine.map(o => `${o.qty}× ${ITEMS[o.item].name}${o.status === "collected" ? " ✓" : ""}`).join(", ")}</div>}</span>
        <span>{st === "landed" && pending.length > 0 && <button className="btn c" data-testid={`collect-${r.id}`} disabled={sv.busy} onClick={() => sv.act("collect", { rocket: r.id })}>pay fuel & collect</button>}</span></div>; })}
    <p style={{ fontSize: 11, opacity: .5 }}>Launches daily at 06:00 and 18:00 UTC (11:00 / 23:00 PKT), 2 h flight, 40 cargo units each.</p></div>;
}
export function InventoryPanel({ sv }: { sv: Sv }) {
  const s = sv.s; if (!s) return null;
  return <div>{!s.inventory.length && <p style={{ opacity: .5 }}>Empty — order from the Earth Shop.</p>}
    {[...s.inventory].sort((a, b) => a.expires_at.localeCompare(b.expires_at)).map(i => { const it = ITEMS[i.item]; const left = Date.parse(i.expires_at) - sv.now; const p = left / (it.lifeH * 3600e3);
      return <div key={i.id} style={{ ...row, gridTemplateColumns: "1fr 120px 70px" }}><span>{it.name}<br /><span style={{ fontSize: 11, opacity: .5 }}>{it.desc}</span></span>
        <span><div style={{ height: 4, background: "#ffffff10" }}><div style={{ width: Math.max(0, p * 100) + "%", height: "100%", background: p < .25 ? "#ff3b4a" : "#4ff2ff" }} /></div><span style={{ fontSize: 11, opacity: .6 }}>{fmtDur(left)} left</span></span>
        {(i.item === "o2" || i.item === "medkit") ? <button className="btn c" data-testid={`use-${i.item}`} disabled={sv.busy || s.player.dead} onClick={() => sv.act("use", { id: i.id })}>use</button> : <span />}</div>; })}
    <p style={{ fontSize: 11, opacity: .5 }}>O₂ drain now: {s.player.drainPerH.toFixed(1)}%/h (base 4%/h · no food ×2 · no water ×1.5 · suit ×0.5)</p></div>;
}

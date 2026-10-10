// Supabase Realtime networking: Presence (who's online + profile + last pos) and Broadcast (positions ~10 Hz, chat).
// Exposes a small Colyseus-like surface (sessionId, state.players, send, onMessage) so the Phaser scene stays the same.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, type Character } from "./api";
import { SPAWN, blocked, W, H } from "../../shared/map";
import { bfs, step, type Ctl } from "../../shared/sim";
export type NetPlayer = { id: string; name: string; color: string; variant: string; x: number; y: number; dir: string; moving: boolean; seen: number };
type CB = (m: never) => void;
export class Net {
  sessionId: string; ch!: RealtimeChannel; me: NetPlayer; ctl: Ctl = { vx: 0, vy: 0, path: [] };
  private map = new Map<string, NetPlayer>(); private handlers = new Map<string, CB[]>(); private addCbs: ((p: NetPlayer, id: string) => void)[] = []; private remCbs: ((p: NetPlayer, id: string) => void)[] = [];
  private timer?: number; private lastSent = ""; private lastSentAt = 0; private lastChat = 0;
  state = { players: { get: (id: string) => this.map.get(id), get size() { return 0; }, forEach: (f: (p: NetPlayer, id: string) => void) => this.map.forEach(f), values: () => this.map.values(),
    onAdd: (f: (p: NetPlayer, id: string) => void) => { this.addCbs.push(f); this.map.forEach((p, id) => f(p, id)); }, onRemove: (f: (p: NetPlayer, id: string) => void) => { this.remCbs.push(f); } } };
  constructor(c: Character) {
    this.sessionId = c.userId; this.me = { id: c.userId, name: c.name, color: c.color, variant: c.variant, x: SPAWN.x + Math.random() - .5, y: SPAWN.y + Math.random() - .5, dir: "S", moving: false, seen: Date.now() };
    Object.defineProperty(this.state.players, "size", { get: () => this.map.size });
  }
  private emit(t: string, m: unknown) { (this.handlers.get(t) || []).forEach(f => f(m as never)); }
  onMessage(t: string, f: CB) { this.handlers.set(t, [...(this.handlers.get(t) || []), f]); }
  private upsert(id: string, d: Partial<NetPlayer>) { const ex = this.map.get(id); if (ex) { Object.assign(ex, d, { seen: Date.now() }); return; }
    if (!d.name) return; const p = { id, name: d.name!, color: d.color || "#ffffff", variant: d.variant || "astronautA", x: d.x ?? SPAWN.x, y: d.y ?? SPAWN.y, dir: d.dir || "S", moving: !!d.moving, seen: Date.now() };
    this.map.set(id, p); this.addCbs.forEach(f => f(p, id)); }
  /** re-add a player we timed out (e.g. their tab was throttled) using their presence profile */
  private revive(id: string) { if (!id || this.map.has(id)) return; const meta = this.ch.presenceState()[id]?.[0] as Partial<NetPlayer> | undefined; if (meta) this.upsert(id, meta); }
  private remove(id: string) { const p = this.map.get(id); if (!p || id === this.sessionId) return; this.map.delete(id); this.remCbs.forEach(f => f(p, id)); this.emit("sys", { text: `${p.name} left` }); }
  async connect() {
    this.map.set(this.sessionId, this.me);
    this.ch = supabase.channel("colony", { config: { presence: { key: this.sessionId }, broadcast: { self: false } } });
    this.ch.on("presence", { event: "sync" }, () => { const st = this.ch.presenceState<{ name: string; color: string; variant: string; x: number; y: number }>();
      for (const [id, metas] of Object.entries(st)) if (id !== this.sessionId) this.upsert(id, metas[0]);
    });
    this.ch.on("presence", { event: "leave" }, ({ key }) => { setTimeout(() => { if (!this.ch.presenceState()[key]) this.remove(key); }, 3000); });
    this.ch.on("presence", { event: "join" }, ({ key, newPresences }) => { if (key !== this.sessionId && !this.map.has(key)) { this.upsert(key, newPresences[0] as never); this.emit("sys", { text: `${(newPresences[0] as { name?: string }).name} entered the colony` }); } });
    this.ch.on("broadcast", { event: "pos" }, ({ payload: p }) => { if (p?.id && p.id !== this.sessionId && Number.isFinite(p.x) && Number.isFinite(p.y)) this.revive(p.id), this.upsert(p.id, { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H), dir: String(p.dir).slice(0, 2), moving: !!p.moving }); });
    this.ch.on("broadcast", { event: "chat" }, ({ payload: m }) => { this.revive(m?.id); const p = this.map.get(m?.id); if (p && typeof m.text === "string") this.emit("chat", { id: p.id, name: p.name, text: m.text.slice(0, 120) }); });
    await new Promise<void>((res, rej) => this.ch.subscribe(async s => { if (s === "SUBSCRIBED") { await this.track(); res(); } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") rej(new Error("realtime " + s)); }));
    let last = performance.now();
    this.timer = window.setInterval(() => { const n = performance.now(); step(this.me, this.ctl, Math.min(.25, (n - last) / 1000)); last = n; this.publish(); }, 33); // departures come from Presence leave (crashed tabs drop after the socket heartbeat timeout)
    addEventListener("pagehide", this.onHide);
  }
  private track() { const m = this.me; return this.ch.track({ name: m.name, color: m.color, variant: m.variant, x: m.x, y: m.y }); }
  private publish() { const m = this.me; const s = `${m.x.toFixed(2)},${m.y.toFixed(2)},${m.dir},${m.moving}`; const now = Date.now();
    if ((s !== this.lastSent && now - this.lastSentAt >= 100) || now - this.lastSentAt > 2000) { this.lastSent = s; this.lastSentAt = now; this.ch.send({ type: "broadcast", event: "pos", payload: { id: m.id, x: +m.x.toFixed(3), y: +m.y.toFixed(3), dir: m.dir, moving: m.moving } }); }
    if (!m.moving && this.lastTracked !== s && now - this.lastTrackAt > 3000) { this.lastTracked = s; this.lastTrackAt = now; this.track(); } } // presence keeps a resting position for late joiners
  private lastTracked = ""; private lastTrackAt = 0;
  send(t: string, m: { vx?: number; vy?: number; x?: number; y?: number; text?: string }) {
    if (t === "input") { this.ctl.vx = Math.sign(m.vx || 0); this.ctl.vy = Math.sign(m.vy || 0); if (this.ctl.vx || this.ctl.vy) this.ctl.path = []; }
    if (t === "moveTo") { const tx = Math.floor(m.x!), ty = Math.floor(m.y!); if (tx < 0 || ty < 0 || tx >= W || ty >= H || blocked(tx, ty)) return; this.ctl.vx = this.ctl.vy = 0; this.ctl.path = bfs(Math.floor(this.me.x), Math.floor(this.me.y), tx, ty).slice(0, 80); }
    if (t === "chat") { const text = String(m.text || "").replace(/\s+/g, " ").trim().slice(0, 120); if (!text || Date.now() - this.lastChat < 800) return; this.lastChat = Date.now();
      this.ch.send({ type: "broadcast", event: "chat", payload: { id: this.sessionId, text } }); this.emit("chat", { id: this.sessionId, name: this.me.name, text }); }
  }
  private onHide = () => this.leave();
  leave() { removeEventListener("pagehide", this.onHide); clearInterval(this.timer); this.ch?.untrack(); supabase.removeChannel(this.ch); }
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

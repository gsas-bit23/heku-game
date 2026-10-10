import { Room, type Client } from "colyseus"; import { Schema, MapSchema, defineTypes } from "@colyseus/schema";
import { verifyToken } from "./auth.js"; import type { CharacterStore, Character } from "./store.js";
import { blocked, SPAWN, W, H } from "../../shared/map.js";
export class Player extends Schema { id = ""; name = ""; color = ""; variant = ""; x = 0; y = 0; dir = "S"; moving = false; }
defineTypes(Player, { id: "string", name: "string", color: "string", variant: "string", x: "number", y: "number", dir: "string", moving: "boolean" });
export class ColonyState extends Schema { players = new MapSchema<Player>(); }
defineTypes(ColonyState, { players: { map: Player } });
type Ctl = { vx: number; vy: number; path: { x: number; y: number }[]; lastChat: number; userId: string };
const SPEED = 4; // tiles / s
const DIRS: Record<string, string> = { "1,0": "SE", "-1,0": "NW", "0,1": "SW", "0,-1": "NE", "1,1": "S", "-1,-1": "N", "1,-1": "E", "-1,1": "W" };
function bfs(sx: number, sy: number, tx: number, ty: number) {
  const k = (x: number, y: number) => y * W + x; const prev = new Map<number, number>(); const q = [[sx, sy]]; prev.set(k(sx, sy), -1);
  while (q.length) { const [x, y] = q.shift()!; if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) { const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || blocked(nx, ny) || prev.has(k(nx, ny))) continue;
      if (dx && dy && (blocked(x + dx, y) || blocked(x, y + dy))) continue; prev.set(k(nx, ny), k(x, y)); q.push([nx, ny]); } }
  if (!prev.has(k(tx, ty))) return []; const out: { x: number; y: number }[] = []; let c = k(tx, ty);
  while (c !== -1 && c !== k(sx, sy)) { out.unshift({ x: (c % W) + 0.5, y: Math.floor(c / W) + 0.5 }); c = prev.get(c)!; } return out;
}
export class ColonyRoom extends Room<ColonyState> {
  maxClients = 64; static store: CharacterStore; ctl = new Map<string, Ctl>();
  onCreate() {
    this.setState(new ColonyState()); this.setPatchRate(50);
    this.onMessage("input", (c, m: { vx: number; vy: number }) => { const t = this.ctl.get(c.sessionId); if (!t) return;
      t.vx = Math.max(-1, Math.min(1, Math.round(+m.vx || 0))); t.vy = Math.max(-1, Math.min(1, Math.round(+m.vy || 0))); if (t.vx || t.vy) t.path = []; });
    this.onMessage("moveTo", (c, m: { x: number; y: number }) => { const t = this.ctl.get(c.sessionId); const p = this.state.players.get(c.sessionId); if (!t || !p) return;
      const tx = Math.floor(+m.x), ty = Math.floor(+m.y); if (!(tx >= 0 && ty >= 0 && tx < W && ty < H) || blocked(tx, ty)) return;
      t.vx = t.vy = 0; t.path = bfs(Math.floor(p.x), Math.floor(p.y), tx, ty).slice(0, 80); });
    this.onMessage("chat", (c, m: { text: string }) => { const t = this.ctl.get(c.sessionId); const p = this.state.players.get(c.sessionId); if (!t || !p) return;
      const text = String(m?.text || "").replace(/\s+/g, " ").trim().slice(0, 120); if (!text || Date.now() - t.lastChat < 600) return; t.lastChat = Date.now();
      this.broadcast("chat", { id: c.sessionId, name: p.name, text }); });
    this.setSimulationInterval(dt => this.tick(dt / 1000), 50);
  }
  async onAuth(_c: Client, o: { token?: string }) { const u = verifyToken(o?.token); if (!u) throw new Error("unauthorized");
    const ch = await ColonyRoom.store.get(u); if (!ch) throw new Error("no character"); return ch; }
  onJoin(c: Client, _o: unknown, auth?: Character) { const ch = auth!;
    for (const [sid, t] of this.ctl) if (t.userId === ch.userId) this.clients.find(x => x.sessionId === sid)?.leave(4000); // one session per user
    const p = new Player(); Object.assign(p, { id: c.sessionId, name: ch.name, color: ch.color, variant: ch.variant, x: SPAWN.x + Math.random() - .5, y: SPAWN.y + Math.random() - .5 });
    this.state.players.set(c.sessionId, p); this.ctl.set(c.sessionId, { vx: 0, vy: 0, path: [], lastChat: 0, userId: ch.userId });
    this.broadcast("sys", { text: `${ch.name} entered the colony` });
  }
  onLeave(c: Client) { const p = this.state.players.get(c.sessionId); this.state.players.delete(c.sessionId); this.ctl.delete(c.sessionId); if (p) this.broadcast("sys", { text: `${p.name} left` }); }
  tick(dt: number) {
    this.state.players.forEach((p, id) => { const t = this.ctl.get(id)!; let vx = t.vx, vy = t.vy;
      if (!vx && !vy && t.path.length) { const w = t.path[0]; const dx = w.x - p.x, dy = w.y - p.y; const d = Math.hypot(dx, dy);
        if (d < 0.08) { t.path.shift(); } else { vx = dx / d; vy = dy / d; } }
      const len = Math.hypot(vx, vy); if (!len) { if (p.moving) p.moving = false; return; }
      const s = SPEED * dt / Math.max(1, len); const nx = p.x + vx * s, ny = p.y + vy * s; const R = 0.25;
      const free = (x: number, y: number) => !blocked(x - R, y - R) && !blocked(x + R, y - R) && !blocked(x - R, y + R) && !blocked(x + R, y + R);
      if (free(nx, p.y)) p.x = nx; if (free(p.x, ny)) p.y = ny;
      p.moving = true; const q = (v: number) => (v > 0.38 ? 1 : v < -0.38 ? -1 : 0); p.dir = DIRS[`${q(vx / (len || 1))},${q(vy / (len || 1))}`] || p.dir; });
  }
}

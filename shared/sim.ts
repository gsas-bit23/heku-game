// Movement sim (pathfinding + collision). Used by the client (Supabase mode, client-authoritative) and kept identical to server/.
import { blocked, W, H } from "./map";
export const SPEED = 4;
const DIRS: Record<string, string> = { "1,0": "SE", "-1,0": "NW", "0,1": "SW", "0,-1": "NE", "1,1": "S", "-1,-1": "N", "1,-1": "E", "-1,1": "W" };
export type Body = { x: number; y: number; dir: string; moving: boolean };
export type Ctl = { vx: number; vy: number; path: { x: number; y: number }[] };
export function bfs(sx: number, sy: number, tx: number, ty: number) {
  const k = (x: number, y: number) => y * W + x; const prev = new Map<number, number>(); const q = [[sx, sy]]; prev.set(k(sx, sy), -1);
  while (q.length) { const [x, y] = q.shift()!; if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) { const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || blocked(nx, ny) || prev.has(k(nx, ny))) continue;
      if (dx && dy && (blocked(x + dx, y) || blocked(x, y + dy))) continue; prev.set(k(nx, ny), k(x, y)); q.push([nx, ny]); } }
  if (!prev.has(k(tx, ty))) return []; const out: { x: number; y: number }[] = []; let c = k(tx, ty);
  while (c !== -1 && c !== k(sx, sy)) { out.unshift({ x: (c % W) + 0.5, y: Math.floor(c / W) + 0.5 }); c = prev.get(c)!; } return out;
}
export function step(p: Body, t: Ctl, dt: number) {
  let vx = t.vx, vy = t.vy;
  if (!vx && !vy && t.path.length) { const w = t.path[0]; const dx = w.x - p.x, dy = w.y - p.y; const d = Math.hypot(dx, dy); if (d < 0.08) t.path.shift(); else { const k = Math.min(1, d / (SPEED * dt)); vx = dx / d * k; vy = dy / d * k; } }
  const len = Math.hypot(vx, vy); if (!len) { p.moving = false; return; }
  const s = SPEED * dt / Math.max(1, len); const nx = p.x + vx * s, ny = p.y + vy * s; const R = 0.25;
  const free = (x: number, y: number) => !blocked(x - R, y - R) && !blocked(x + R, y - R) && !blocked(x - R, y + R) && !blocked(x + R, y + R);
  if (free(nx, p.y)) p.x = nx; if (free(p.x, ny)) p.y = ny;
  const q = (v: number) => (v > 0.38 ? 1 : v < -0.38 ? -1 : 0); p.moving = true; p.dir = DIRS[`${q(vx / len)},${q(vy / len)}`] || p.dir;
}

import Phaser from "phaser"; import type { Room } from "colyseus.js";
import { GRID, W, H, BUILDINGS, type Building } from "../../shared/map";
export const TW = 65, TH = 32.5; const OY = 0.616;
export const iso = (x: number, y: number) => ({ sx: (x - y) * TW / 2, sy: (x + y) * TH / 2 });
export const unIso = (sx: number, sy: number) => ({ x: (sx / (TW / 2) + sy / (TH / 2)) / 2, y: (sy / (TH / 2) - sx / (TW / 2)) / 2 });
export const bus = new EventTarget(); export const emit = (t: string, d?: unknown) => bus.dispatchEvent(new CustomEvent(t, { detail: d }));
type P = { id: string; name: string; color: string; variant: string; x: number; y: number; dir: string; moving: boolean };
type V = { c: Phaser.GameObjects.Container; spr: Phaser.GameObjects.Image; tx: number; ty: number; rx: number; ry: number; p: P; bubble?: Phaser.GameObjects.Container; bt?: number; variant: string };
const SPR_DIR: Record<string, string> = { N: "N", S: "S", E: "E", W: "W", NE: "NE", NW: "NW", SE: "SE", SW: "SW" };
export class ColonyScene extends Phaser.Scene {
  room!: Room; me = ""; views = new Map<string, V>(); keys!: Record<string, Phaser.Input.Keyboard.Key>; lastInput = "0,0"; near: Building | null = null; marker!: Phaser.GameObjects.Graphics;
  constructor() { super("colony"); }
  init(d: { room: Room }) { this.room = d.room; this.me = d.room.sessionId; }
  preload() {
    const names = new Set<string>(["terrain_SE", "crater_SE", "craterLarge_SE", "rock_largeA_SE", "rock_largeB_SE", "rocks_smallA_SE", "rock_crystals_SE", "meteor_SE", "terrain_roadStraight_SE", "terrain_roadStraight_SW", "terrain_roadCross_SE", "machine_wireless_SE", "barrels_SE", "rover_SE", "machine_generatorLarge_SE"]);
    BUILDINGS.forEach(b => b.sprites.forEach(s => names.add(s)));
    for (const v of ["astronautA", "astronautB"]) for (const d of Object.values(SPR_DIR)) names.add(`${v}_${d}`);
    names.forEach(n => this.load.image(n, `/assets/${n}.png`));
  }
  create() {
    this.cameras.main.setBackgroundColor("#07050a");
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const { sx, sy } = iso(x + .5, y + .5); const c = GRID[y][x];
      const road = c === 3 ? (y === 12 && x === 12 ? "terrain_roadCross_SE" : y === 12 ? "terrain_roadStraight_SE" : "terrain_roadStraight_SW") : "terrain_SE";
      this.add.image(sx, sy, road).setOrigin(.5, OY).setDepth(-1e6 + sy);
      if (c === 2) this.add.image(sx, sy, (x + y) % 2 ? "crater_SE" : "craterLarge_SE").setOrigin(.5, OY).setDepth(-1e5 + sy);
      if (c === 1) this.add.image(sx, sy, ["rock_largeA_SE", "rock_largeB_SE", "rocks_smallA_SE", "rock_crystals_SE", "meteor_SE"][(x * 7 + y * 3) % 5]).setOrigin(.5, OY).setDepth(sy);
    }
    for (const b of BUILDINGS) { const { sx, sy } = iso(b.x + b.w / 2, b.y + b.h / 2); const sc = Math.max(b.w, b.h) > 1 ? 1.7 : 1.15;
      b.sprites.forEach((s, i) => this.add.image(sx, sy - i * 34 * sc, s).setOrigin(.5, OY).setScale(sc).setDepth(sy + i * .01 + (b.h * TH) / 2));
      this.add.text(sx, sy - 70 * sc - (b.sprites.length - 1) * 34 * sc, b.name.toUpperCase(), { fontFamily: "Chakra Petch", fontSize: "11px", color: "#4ff2ff", backgroundColor: "#07050acc", padding: { x: 6, y: 2 } }).setOrigin(.5).setDepth(1e6).setAlpha(.85); }
    this.marker = this.add.graphics().setDepth(-5e5);
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,E", false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on("pointerdown", (pt: Phaser.Input.Pointer) => { const g = unIso(pt.worldX, pt.worldY); this.room.send("moveTo", { x: g.x, y: g.y });
      const t = iso(Math.floor(g.x) + .5, Math.floor(g.y) + .5); this.marker.clear().lineStyle(2, 0x4ff2ff, .9).strokePoints([new Phaser.Math.Vector2(t.sx, t.sy - TH / 2), new Phaser.Math.Vector2(t.sx + TW / 2, t.sy), new Phaser.Math.Vector2(t.sx, t.sy + TH / 2), new Phaser.Math.Vector2(t.sx - TW / 2, t.sy)], true);
      this.tweens.add({ targets: this.marker, alpha: { from: 1, to: 0 }, duration: 900 }); });
    this.keys.E.on("down", () => { if (this.near && !typing()) emit("interact", this.near); });
    const $ = this.room.state.players;
    $.onAdd((p: P, id: string) => { this.addView(id, p); emit("roster", null); });
    $.onRemove((_p: P, id: string) => { const v = this.views.get(id); v?.c.destroy(); this.views.delete(id); emit("roster", null); });
    this.room.onMessage("chat", (m: { id: string; name: string; text: string }) => { this.bubble(m.id, m.text); emit("chat", m); });
    this.room.onMessage("sys", (m: { text: string }) => emit("chat", { name: "COLONY", text: m.text, sys: true }));
    this.scale.on("resize", () => this.cameras.main.setZoom(window.innerWidth < 700 ? .8 : 1));
  }
  addView(id: string, p: P) {
    const { sx, sy } = iso(p.x, p.y); const col = Phaser.Display.Color.HexStringToColor(p.color).color;
    const shadow = this.add.ellipse(0, 0, 30, 12, 0x000000, .45);
    const spr = this.add.image(0, 0, `${p.variant}_S`).setOrigin(.5, OY).setScale(.9).setTint(col);
    const ring = id === this.me ? this.add.ellipse(0, 0, 38, 16).setStrokeStyle(1.5, 0xffb340, .9) : this.add.ellipse(0, 0, 1, 1, 0, 0);
    const label = this.add.text(0, -78, p.name, { fontFamily: "Share Tech Mono", fontSize: "12px", color: id === this.me ? "#ffb340" : "#f1e3d3", stroke: "#07050a", strokeThickness: 3 }).setOrigin(.5);
    const c = this.add.container(sx, sy, [ring, shadow, spr, label]);
    this.views.set(id, { c, spr, tx: p.x, ty: p.y, rx: p.x, ry: p.y, p, variant: p.variant });
    if (id === this.me) this.cameras.main.startFollow(c, true, .12, .12);
  }
  bubble(id: string, text: string) { const v = this.views.get(id); if (!v) return; v.bubble?.destroy();
    const t = this.add.text(0, 0, text, { fontFamily: "Share Tech Mono", fontSize: "12px", color: "#07050a", wordWrap: { width: 180 } }).setOrigin(.5, 1);
    const bg = this.add.graphics(); const b = t.getBounds(); bg.fillStyle(0x4ff2ff, .95).fillRoundedRect(-b.width / 2 - 7, -b.height - 6, b.width + 14, b.height + 10, 4).fillTriangle(-5, 4, 5, 4, 0, 10);
    const box = this.add.container(0, -96, [bg, t]); v.c.add(box); v.bubble = box; v.bt = this.time.now + 5000; }
  update(time: number, dt: number) {
    // input
    if (!typing()) { const k = this.keys; const up = k.W.isDown || k.UP.isDown, dn = k.S.isDown || k.DOWN.isDown, lf = k.A.isDown || k.LEFT.isDown, rt = k.D.isDown || k.RIGHT.isDown;
      let vx = 0, vy = 0; if (up) { vx--; vy--; } if (dn) { vx++; vy++; } if (lf) { vx--; vy++; } if (rt) { vx++; vy--; }
      vx = Math.sign(vx); vy = Math.sign(vy); const s = `${vx},${vy}`; if (s !== this.lastInput) { this.lastInput = s; this.room.send("input", { vx, vy }); } }
    // interpolate views toward authoritative state
    const a = 1 - Math.pow(0.001, dt / 1000 * 1.6);
    this.views.forEach((v, id) => { const p = this.room.state.players.get(id) as P | undefined; if (!p) return;
      v.rx += (p.x - v.rx) * a; v.ry += (p.y - v.ry) * a; if (Math.hypot(p.x - v.rx, p.y - v.ry) > 3) { v.rx = p.x; v.ry = p.y; }
      const { sx, sy } = iso(v.rx, v.ry); v.c.setPosition(sx, sy).setDepth(sy + 1);
      v.spr.setTexture(`${p.variant}_${SPR_DIR[p.dir] || "S"}`);
      v.spr.y = p.moving ? -Math.abs(Math.sin(time / 90)) * 5 : 0; v.spr.setScale(.9, p.moving ? .9 + Math.sin(time / 45) * .03 : .9); v.spr.angle = p.moving ? Math.sin(time / 90) * 4 : 0;
      if (v.bubble && v.bt! < time) { v.bubble.destroy(); v.bubble = undefined; } });
    // nearest interactable
    const me = this.views.get(this.me); if (me) { let best: Building | null = null; let bd = 2.4;
      for (const b of BUILDINGS) { const d = Math.hypot(me.rx - (b.x + b.w / 2), me.ry - (b.y + b.h / 2)) - Math.max(b.w, b.h) / 2; if (d < bd) { bd = d; best = b; } }
      if (best?.id !== this.near?.id) { this.near = best; emit("near", best); } }
  }
}
export const typing = () => ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "");

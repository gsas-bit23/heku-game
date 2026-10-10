// Shared colony map (server collision + client rendering). Grid coords: x = column, y = row.
export const W = 26, H = 26;
export type Building = { id: string; name: string; x: number; y: number; w: number; h: number; sprites: string[] };
export const BUILDINGS: Building[] = [
  { id: "shop", name: "Earth Shop terminal", x: 6, y: 6, w: 2, h: 2, sprites: ["hangar_largeA_SE"] },
  { id: "launch", name: "Launch Pad", x: 18, y: 6, w: 2, h: 2, sprites: ["rocket_baseA_SE", "rocket_fuelA_SE", "rocket_sidesA_SE", "rocket_topA_SE"] },
  { id: "mine", name: "Mining Gate", x: 18, y: 18, w: 2, h: 1, sprites: ["gate_complex_SE"] },
  { id: "bridge", name: "Bridge kiosk", x: 6, y: 18, w: 1, h: 1, sprites: ["desk_computerScreen_SE"] },
  { id: "dish", name: "Comms Array", x: 12, y: 4, w: 1, h: 1, sprites: ["satelliteDish_large_SE"] },
];
export const SPAWN = { x: 12.5, y: 12.5 };
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
/** 0 = ground, 1 = rock (blocked), 2 = crater (walkable decor), 3 = road, 9 = building */
export const GRID: number[][] = (() => {
  const r = rng(46630); const g = Array.from({ length: H }, () => Array(W).fill(0));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) g[y][x] = 1;
    else { const v = r(); if (v < 0.05) g[y][x] = 1; else if (v < 0.09) g[y][x] = 2; }
  }
  for (let i = 3; i < W - 3; i++) { g[12][i] = 3; g[i][12] = 3; }
  for (const b of BUILDINGS) for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) if (g[y]?.[x] === 1) g[y][x] = 0;
  for (const b of BUILDINGS) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) g[y][x] = 9;
  for (let y = 11; y <= 14; y++) for (let x = 11; x <= 14; x++) if (g[y][x] === 1) g[y][x] = 0;
  return g;
})();
export const blocked = (x: number, y: number) => { const c = GRID[Math.floor(y)]?.[Math.floor(x)]; return c === undefined || c === 1 || c === 9; };
export const DROID_VARIANTS = ["astronautA", "astronautB"] as const;
export const DROID_COLORS = ["#ffb340", "#4ff2ff", "#ff3b4a", "#9bd36a", "#c08cff", "#f1e3d3"];

// Phase 2 item catalog (prices/cargo from heku-droid-vite; lifetimes scaled to real time).
export const ITEMS = {
  o2: { name: "Oxygen Tank", price: 30, cargo: 2, lifeH: 48, desc: "Use: +45% O₂" },
  water: { name: "Water Cell", price: 12, cargo: 2, lifeH: 72, desc: "Held: avoids 1.5× O₂ drain" },
  food: { name: "Ration Brick", price: 10, cargo: 1, lifeH: 36, desc: "Held: avoids 2× O₂ drain" },
  battery: { name: "Li-Battery", price: 25, cargo: 1, lifeH: 48, desc: "Powers the drill (Phase 3)" },
  solar: { name: "Solar Panel", price: 60, cargo: 4, lifeH: 336, desc: "Slows battery decay (Phase 3)" },
  drill: { name: "Plasma Drill", price: 80, cargo: 3, lifeH: 240, desc: "Needed to mine (Phase 3)" },
  medkit: { name: "Medkit", price: 40, cargo: 1, lifeH: 168, desc: "Use: +25% O₂" },
  suit: { name: "Thermal Suit", price: 50, cargo: 2, lifeH: 168, desc: "Held: halves O₂ drain" },
} as const;
export type ItemKey = keyof typeof ITEMS;
export const ECON = { STARTER_PAPER: 300, BASE_DRAIN_PER_H: 4, FUEL_BASE: 60, FUEL_PER_UNIT: 3, CAPACITY: 40, LAUNCH_UTC_H: [6, 18], FLIGHT_H: 2, CUTOFF_MIN: 10 };

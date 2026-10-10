# Heku Droid — Colony (Phase 1)

> **Current backend: Supabase** (project `heku-game`, ref `reddsewdebddtbbromvg`). Live at https://heku-game.vercel.app.
> - `supabase/functions/auth`: edge function. Handles wallet nonce issue/verify (viem `verifyMessage`) and guest login, and returns an HMAC session token. Character load/save happen there too.
> - `supabase/migrations`: the `characters` table (RLS: public read, writes only through the function using the service role), nonces, and the token secret.
> - `client/src/net.ts`: Supabase Realtime channel `colony`. Presence tracks who's online (callsign, chassis, color, resting position). Broadcast carries `pos` (about 10 Hz while moving, 2 s heartbeat; clients smooth between updates) and `chat` (client-side limit of one message per 800 ms).
> - Movement, pathfinding and collision now run **in the client** (`shared/sim.ts`). This is client-authoritative: a modified client could teleport or fake its position. Fine for a social hub, not for anything with stakes.
> - Client env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key).
> - `server/` (Colyseus) is **kept but unused**. It's the authoritative option once real-time rules matter (Railway, see below).

2D isometric multiplayer Mars colony. Phaser 3 client + Colyseus authoritative server.

```
client/   Vite + React (login / character UI, HUD) + Phaser 3 scene, wagmi/RainbowKit (Robinhood Chain Testnet 46630)
server/   Node + Express (auth, characters) + Colyseus room "colony"
shared/   map.ts — the map grid, buildings, and droid options, used by both client and server
```

## Run locally
```
cd client && npm i && VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run dev
```
The legacy Colyseus server (`cd server && npm run dev`) isn't used by the current client.
To point the client at another server: build with `VITE_SERVER_URL=https://…`, or open `https://<client>/?server=https://…`. The `?server=` value is remembered in localStorage.

## Phase 1 features
- Wallet login: connect an injected wallet. The server issues a nonce and you sign a gas-free message. The server checks it with viem `verifyMessage` and returns an HMAC session token (7 days). Guest login (24 h) is also available.
- Character creation: a callsign (unique), a chassis (Scout or Hauler) and a paint color, saved server-side through the `CharacterStore` interface (`server/src/store.ts`). The current backend is a JSON file in `server/data/`. Implement a `SupabaseStore` with the same 3 methods to move to Postgres.
- Colony hub: a 26×26 isometric map with rocks (collision), craters and roads. Five interactable placeholders: Earth Shop, Launch Pad, Mining Gate, Bridge kiosk, Comms Array. Walk within range and press `[E]` to open a panel.
- Movement: WASD/arrows, or click to move (BFS pathfinding on the server). The camera follows you, sprites are depth-sorted, and the walk animation is a bob/sway plus 8-direction sprites.
- Multiplayer: the server simulates movement at 20 Hz and sends state patches every 50 ms. Clients smooth positions between updates. Name tags, chat bubbles plus a chat log, join/leave messages. One session per account; a second login kicks the first.
- HUD: an O₂ bar (placeholder), online count, and the colony's Mars palette.

## Security notes
- Set `SESSION_SECRET` in production. If it isn't set, a random secret is generated and tokens become invalid on every restart.
- The login nonce expires after 5 minutes and can only be used once. Chat is limited to 120 characters and one message every 600 ms. Movement input is clamped on the server.

## Permanent hosting (Railway)
1. New Railway project → deploy from the GitHub repo, root directory `server/`, start command `npm start`.
2. Variables: `SESSION_SECRET=<random 64 hex>`, `PORT` is provided by Railway. Add a volume mounted at `/app/data` and set `DATA_DIR=/app/data`, or switch to Supabase.
3. Generate a Railway domain, then set `VITE_SERVER_URL=https://<railway-domain>` in Vercel and redeploy the client.
4. The single Colyseus process holds all rooms in memory. Scaling past one instance needs `@colyseus/redis-presence` + `redis-driver`.

## Asset credits
All 3D-rendered isometric sprites come from **Kenney — Space Kit** (https://kenney.nl/assets/space-kit), licensed **CC0 1.0**.
They were recolored toward a Mars palette (terrain, rocks, craters) and downscaled. See `client/public/KENNEY_LICENSE.txt`. Thank you, Kenney!

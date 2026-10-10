import { useEffect, useRef, useState } from "react"; import Phaser from "phaser"; import { Net } from "./net";
import { ColonyScene, bus } from "./scene"; import { type Character } from "./api"; import type { Building } from "../../shared/map";
import { useSurvival, ShopPanel, LaunchPanel, InventoryPanel } from "./survival";
type Msg = { name: string; text: string; sys?: boolean };
export default function Game({ token, me, onLogout }: { token: string; me: Character; onLogout: () => void }) {
  const host = useRef<HTMLDivElement>(null); const roomRef = useRef<Net>(); const [log, setLog] = useState<Msg[]>([]); const [near, setNear] = useState<Building | null>(null);
  const [panel, setPanel] = useState<Building | null>(null); const [text, setText] = useState(""); const [count, setCount] = useState(0); const [err, setErr] = useState(""); const sv = useSurvival(token); const o2 = sv.oxygen; const [inv, setInv] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "i" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "")) setInv(v => !v); }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  useEffect(() => { let game: Phaser.Game | undefined; let dead = false;
    const net = new Net(me); net.connect().then(() => { const room = net; if (dead) { room.leave(); return; } roomRef.current = room; (window as unknown as { __room: Net }).__room = room; setCount(room.state.players.size);
      game = new Phaser.Game({ type: Phaser.AUTO, parent: host.current!, backgroundColor: "#07050a", scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight }, scene: [] });
      game.scene.add("colony", ColonyScene, true, { room }); })
      .catch(e => { net.leave(); setErr("Could not join colony: " + (e.message || e)); });
    const on = (t: string, f: (d: never) => void) => { const h = (e: Event) => f((e as CustomEvent).detail as never); bus.addEventListener(t, h); return () => bus.removeEventListener(t, h); };
    const offs = [on("chat", (m: Msg) => setLog(l => [...l.slice(-30), m])), on("near", (b: Building | null) => setNear(b)), on("interact", (b: Building) => setPanel(b)),
      on("roster", () => setCount(roomRef.current?.state.players.size ?? 0))];
    return () => { dead = true; offs.forEach(f => f()); roomRef.current?.leave(); game?.destroy(true); };
  }, [token, me]);
  const send = () => { if (text.trim()) roomRef.current?.send("chat", { text }); setText(""); };
  return <>
    <div ref={host} style={{ position: "fixed", inset: 0 }} />
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, display: "flex", gap: 24, alignItems: "center", padding: "10px 18px", background: "linear-gradient(#07050aee,#07050a00)", zIndex: 10 }}>
      <span className="d" style={{ color: "#d98a5f", fontWeight: 700 }}>HEKU<span style={{ color: "#4ff2ff" }}>//</span>COLONY</span>
      <div style={{ width: 220 }}><div className="tag" style={{ display: "flex", justifyContent: "space-between" }}><span>O₂ reserve</span><span style={{ color: o2 < 35 ? "#ff3b4a" : "#4ff2ff" }}><span data-testid="o2">{o2.toFixed(2)}</span>%</span></div>
        <div style={{ height: 6, background: "#ffffff10" }}><div style={{ height: "100%", width: o2 + "%", background: o2 < 35 ? "#ff3b4a" : "#4ff2ff", boxShadow: "0 0 10px #4ff2ff", transition: "width .8s" }} /></div></div>
      <span className="tag">paper <b style={{ color: "#ffb340" }} data-testid="paper">{sv.s?.player.paper ?? "…"}</b></span><button className="btn c" data-testid="inv-btn" onClick={() => setInv(v => !v)}>inventory [I]</button><span className="tag">colonists online: <b style={{ color: "#ffb340" }} data-testid="online">{count}</b></span>
      <span style={{ marginLeft: "auto" }} className="tag">{me.name} · {me.userId.startsWith("w:") ? me.userId.slice(2, 8) + "…" + me.userId.slice(-4) : "guest"}</span><button className="btn c" onClick={onLogout}>exit</button></div>
    <div style={{ position: "fixed", left: 16, bottom: 16, width: 360, zIndex: 10 }}>
      <div data-testid="chatlog" style={{ maxHeight: 180, overflowY: "auto", fontSize: 13, marginBottom: 6, textShadow: "0 1px 2px #000" }}>{log.map((m, i) => <div key={i} style={{ color: m.sys ? "#4ff2ff99" : "#f1e3d3" }}><b style={{ color: m.sys ? "#4ff2ff" : "#ffb340" }}>{m.name}:</b> {m.text}</div>)}</div>
      <input data-testid="chat" style={{ width: "100%", background: "#07050acc", padding: "8px 10px" }} placeholder="Enter to chat · WASD / click to move · E to interact" value={text} maxLength={120}
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { send(); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} /></div>
    {near && !panel && <div className="holo" style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", padding: "10px 18px", zIndex: 10 }}><span className="d" style={{ color: "#ffb340" }}>[E]</span> {near.name}</div>}
    {panel && <div className="center" style={{ background: "#07050aaa", zIndex: 20 }} onClick={() => setPanel(null)}><div className="holo" style={{ width: panel.id === "shop" || panel.id === "launch" ? 640 : 420, maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
      <div className="tag">terminal · {panel.id}</div><h2 className="d">{panel.name}</h2>{panel.id === "shop" ? <ShopPanel sv={sv} /> : panel.id === "launch" ? <LaunchPanel sv={sv} /> : <p style={{ opacity: .7 }}>Coming in Phase 3: {({ shop: "order Earth supplies (oxygen, water, batteries…)", launch: "rocket schedule, cargo & shared fuel", mine: "enter the mining zone", bridge: "HEKU ⇄ Paper bridge (on-chain)", dish: "colony news & leaderboard" } as Record<string, string>)[panel.id]}.</p>}{sv.msg && <div data-testid="msg" style={{ color: "#4ff2ff", fontSize: 12, margin: "8px 0" }}>▸ {sv.msg}</div>}
      <button className="btn" onClick={() => setPanel(null)}>close</button></div></div>}
    {inv && <div className="holo" style={{ position: "fixed", right: 16, top: 64, width: 380, maxHeight: "75vh", overflowY: "auto", zIndex: 15 }}><div className="d" style={{ marginBottom: 8 }}>Inventory</div><InventoryPanel sv={sv} />{sv.msg && <div style={{ color: "#4ff2ff", fontSize: 12 }}>▸ {sv.msg}</div>}</div>}
    {sv.s?.player.dead && <div className="center" style={{ background: "#ff3b4a33", zIndex: 25 }}><div style={{ textAlign: "center" }}><div className="d" style={{ fontSize: 48, color: "#ff3b4a" }}>ASPHYXIATED</div><p>Your inventory dropped in a crate where you fell (looting comes in Phase 3).</p><button className="btn" data-testid="respawn" onClick={() => sv.act("respawn")}>Respawn at Hab (60% O₂)</button></div></div>}
    {err && <div className="center" style={{ background: "#07050acc", zIndex: 30 }}><div className="holo"><div className="err" style={{ fontSize: 16 }}>{err}</div><button className="btn" style={{ marginTop: 12 }} onClick={onLogout}>back</button></div></div>}
  </>;
}

import { useState } from "react"; import { api, type Character } from "./api"; import { DROID_COLORS, DROID_VARIANTS } from "../../shared/map";
export default function CharacterCreate({ token, onDone }: { token: string; onDone: (c: Character) => void }) {
  const [name, setName] = useState(""); const [color, setColor] = useState(DROID_COLORS[0]); const [variant, setVariant] = useState<string>(DROID_VARIANTS[0]); const [err, setErr] = useState("");
  const save = async () => { try { const { character } = await api<{ character: Character }>("/character", { method: "POST", token, body: JSON.stringify({ name, color, variant }) }); onDone(character); } catch (e) { setErr((e as Error).message); } };
  return <div className="center"><div className="holo" style={{ width: 520 }}>
    <div className="tag">droid fabrication bay</div><h2 className="d" style={{ margin: "6px 0 16px" }}>Build your droid</h2>
    <label className="tag">callsign</label><input data-testid="name" style={{ width: "100%", fontSize: 22 }} value={name} maxLength={16} onChange={e => setName(e.target.value)} placeholder="e.g. ARES-7" />
    <div className="tag" style={{ marginTop: 18 }}>chassis</div>
    <div style={{ display: "flex", gap: 16, marginTop: 8 }}>{DROID_VARIANTS.map(v => <button key={v} onClick={() => setVariant(v)} style={{ background: variant === v ? "rgba(255,179,64,.15)" : "transparent", border: `1px solid ${variant === v ? "#ffb340" : "#4ff2ff33"}`, padding: 6, cursor: "pointer" }}>
      <div style={{ width: 96, height: 96, background: `url(/assets/${v}_S.png) center/180% no-repeat`, filter: `drop-shadow(0 0 8px ${color})` }} /><div className="tag">{v === "astronautA" ? "Scout" : "Hauler"}</div></button>)}</div>
    <div className="tag" style={{ marginTop: 18 }}>paint</div>
    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>{DROID_COLORS.map(c => <button key={c} aria-label={c} onClick={() => setColor(c)} style={{ width: 32, height: 32, background: c, border: color === c ? "3px solid #fff" : "1px solid #000", cursor: "pointer" }} />)}</div>
    <div style={{ marginTop: 22 }}><button className="btn" onClick={save}>Deploy droid</button></div>{err && <div className="err">{err}</div>}</div></div>;
}

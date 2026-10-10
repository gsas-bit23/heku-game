import { useState } from "react"; import { ConnectButton } from "@rainbow-me/rainbowkit"; import { useAccount, useSignMessage } from "wagmi";
import { api } from "./api";
export default function Login({ onToken }: { onToken: (t: string) => void }) {
  const { address, isConnected } = useAccount(); const { signMessageAsync } = useSignMessage(); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const sign = async () => { setBusy(true); setErr(""); try { const { message } = await api<{ message: string }>(`/auth/nonce?address=${address}`);
    const signature = await signMessageAsync({ message }); const { token } = await api<{ token: string }>("/auth/verify", { method: "POST", body: JSON.stringify({ address, signature }) }); onToken(token); }
    catch (e) { setErr((e as { shortMessage?: string }).shortMessage || (e as Error).message); } finally { setBusy(false); } };
  const guest = async () => { try { const { token } = await api<{ token: string }>("/auth/guest", { method: "POST" }); onToken(token); } catch (e) { setErr("Server unreachable: " + (e as Error).message); } };
  return <div className="center"><div className="holo" style={{ width: 420 }}>
    <div className="tag">jezero colony · uplink</div><h1 className="d" style={{ fontSize: 34, margin: "8px 0 4px", color: "#d98a5f" }}>HEKU<span style={{ color: "#4ff2ff" }}>//</span>DROID</h1>
    <p style={{ opacity: .7, fontSize: 13 }}>Sign in with your wallet (free signature, no gas) or land as a guest.</p>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
      <ConnectButton chainStatus="icon" showBalance={false} />
      {isConnected && <button className="btn" disabled={busy} onClick={sign}>{busy ? "Check your wallet…" : "Sign in with wallet"}</button>}
      <button className="btn c" onClick={guest}>Land as guest</button></div>
    {err && <div className="err">{err}</div>}</div></div>;
}

import React, { useEffect, useState } from "react"; import ReactDOM from "react-dom/client";
import "@fontsource/chakra-petch/400.css"; import "@fontsource/chakra-petch/700.css"; import "@fontsource/share-tech-mono/400.css"; import "./style.css";
import { WalletProviders } from "./wallet"; import Login from "./Login"; import CharacterCreate from "./CharacterCreate"; import Game from "./Game"; import { fn, type Character } from "./api";
function App() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem("heku-token")); const [ch, setCh] = useState<Character | null | undefined>(undefined);
  useEffect(() => { if (!token) return; sessionStorage.setItem("heku-token", token);
    fn<{ character: Character | null }>("me", { token }).then(r => setCh(r.character)).catch(() => { sessionStorage.removeItem("heku-token"); setToken(null); }); }, [token]);
  const logout = () => { sessionStorage.removeItem("heku-token"); setToken(null); setCh(undefined); };
  if (!token) return <Login onToken={setToken} />;
  if (ch === undefined) return <div className="center tag">establishing uplink…</div>;
  if (!ch) return <CharacterCreate token={token} onDone={setCh} />;
  return <Game token={token} me={ch} onLogout={logout} />;
}
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><WalletProviders><App /></WalletProviders></React.StrictMode>);

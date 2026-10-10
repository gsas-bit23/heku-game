import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, connectorsForWallets, darkTheme } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rabbyWallet, coinbaseWallet, walletConnectWallet, rainbowWallet } from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, createConfig, http, useAccount, useSwitchChain } from "wagmi";
import { defineChain } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
export const robinhoodTestnet = defineChain({ id: 46630, name: "Robinhood Chain Testnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com/rpc"] } }, blockExplorers: { default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" } }, testnet: true });
const WC = (import.meta.env.VITE_WC_PROJECT_ID || "").trim(); const hasWC = /^[0-9a-f]{32}$/i.test(WC);
const eth = (window as unknown as { ethereum?: { isMetaMask?: boolean; isRabby?: boolean } }).ethereum;
const connectors = connectorsForWallets([
  { groupName: "Browser extension", wallets: [injectedWallet, ...(eth?.isMetaMask && !eth?.isRabby ? [metaMaskWallet] : []), ...(eth?.isRabby ? [rabbyWallet] : [])] },
  { groupName: "More", wallets: hasWC ? [coinbaseWallet, metaMaskWallet, rainbowWallet, walletConnectWallet] : [coinbaseWallet] },
], { appName: "Heku Droid", projectId: hasWC ? WC : "00000000000000000000000000000000" });
const config = createConfig({ connectors, chains: [robinhoodTestnet], transports: { [robinhoodTestnet.id]: http() } });
const qc = new QueryClient();
function AutoSwitch() { const { isConnected, chainId } = useAccount(); const { switchChain } = useSwitchChain();
  useEffect(() => { if (isConnected && chainId !== robinhoodTestnet.id) switchChain({ chainId: robinhoodTestnet.id }); }, [isConnected, chainId, switchChain]); return null; }
export function WalletProviders({ children }: { children: React.ReactNode }) {
  return <WagmiProvider config={config}><QueryClientProvider client={qc}><RainbowKitProvider theme={darkTheme({ accentColor: "#ffb340", accentColorForeground: "#07050a", borderRadius: "none" })}><AutoSwitch />{children}</RainbowKitProvider></QueryClientProvider></WagmiProvider>;
}

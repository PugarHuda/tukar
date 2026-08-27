"use client";

// Wallet context for Tukar. Multi-wallet connect via @creit.tech/stellar-wallets-kit (Freighter,
// xBull, Albedo, Rabet, Lobstr, Hana) plus the built-in throwaway demo key ("use testnet key") for
// judges with no wallet. Exposes an explicit connection model (no silent signing): a route gates its
// on-chain actions on `connected`. Wires setWalletSigner() from lib/stellar so deposits/withdraws/
// disclosures are signed by the chosen wallet when connected, else the built-in demo key. The signer
// shape (WalletSigner: address + signTransaction + signAuthEntry) is identical whichever wallet signs.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  setWalletSigner,
  activeAddress,
  friendbotFund,
  addUsdcTrustline,
  faucetUsdc,
  type WalletSigner,
} from "@/lib/stellar";
import { walletKit } from "@/lib/wallet-kit";

const PASSPHRASE = "Test SDF Network ; September 2015";

const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

// Display names for the wallet ids the kit reports (productId). The kit is initialised with exactly
// these six modules, so the map is complete; the fallback covers any future addition defensively.
const WALLET_NAMES: Record<string, string> = {
  freighter: "Freighter",
  xbull: "xBull",
  albedo: "Albedo",
  rabet: "Rabet",
  lobstr: "Lobstr",
  hana: "Hana",
};
const nameFor = (id: string): string => WALLET_NAMES[id] || "wallet";

// A WalletSigner backed by the kit's active module. The kit's signTransaction/signAuthEntry throw on
// error themselves, so no {error} unwrap is needed — the returned shape matches makeSigner's old one.
function makeKitSigner(kit: Awaited<ReturnType<typeof walletKit>>, address: string): WalletSigner {
  return {
    address,
    signTransaction: async (xdr: string, opts?: any) => {
      const res = await kit.signTransaction(xdr, { networkPassphrase: PASSPHRASE, address, ...(opts || {}) });
      return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress || address };
    },
    signAuthEntry: async (xdr: string, opts?: any) => {
      const res = await kit.signAuthEntry(xdr, { address, ...(opts || {}) });
      return { signedAuthEntry: res.signedAuthEntry, signerAddress: res.signerAddress || address };
    },
  };
}

// The wallet id from the kit (e.g. "freighter", "xbull"), or "demo" for the built-in key, or null.
// Kept assignable to string so downstream freighter-only branches (`kind === "freighter"`) still work.
export type WalletKind = string | null;
export type WalletState = {
  connected: boolean;
  kind: WalletKind;
  /** Human-readable name of the connected wallet ("Freighter", "xBull", "testnet key", …). */
  walletName: string | null;
  address: string | null; // active signer address (connected wallet addr or demo key)
  connecting: boolean;
  /** Open the multi-wallet modal, install the chosen wallet as signer, run best-effort testnet funding. */
  connectWallet: (onStep?: (m: string) => void) => Promise<void>;
  /** Use the built-in throwaway testnet key (real testnet txs, no install). */
  connectDemoKey: () => void;
  disconnect: () => void;
};

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [kind, setKind] = useState<WalletKind>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connectDemoKey = useCallback(() => {
    setWalletSigner(null); // built-in demo key is the default signer
    setKind("demo");
    setWalletName("testnet key");
    setAddress(activeAddress());
    try {
      localStorage.setItem("tukar:conn", "demo");
    } catch {}
  }, []);

  const disconnect = useCallback(() => {
    setWalletSigner(null);
    setKind(null);
    setWalletName(null);
    setAddress(null);
    try {
      localStorage.removeItem("tukar:conn");
    } catch {}
    // No kit.disconnect() needed: rehydrate is gated on our own "tukar:conn" key (removed above),
    // so the kit's remembered session is never resurrected. Avoids loading the kit bundle on disconnect.
  }, []);

  const connectWallet = useCallback(async (onStep?: (m: string) => void) => {
    setConnecting(true);
    try {
      const kit = await withTimeout(walletKit(), 8000, "wallet kit failed to load");
      // Opens the kit modal; the user picks a wallet and grants access. authModal sets that wallet as
      // the active module and returns its address, or rejects if the user cancels.
      const { address: addr } = await kit.authModal();
      if (!addr || typeof addr !== "string") throw new Error("no wallet selected");
      const id = (() => {
        try {
          return kit.selectedModule.productId;
        } catch {
          return "wallet";
        }
      })();
      const signer = makeKitSigner(kit, addr);
      setWalletSigner(signer);
      setKind(id);
      setWalletName(nameFor(id));
      setAddress(addr);
      try {
        localStorage.setItem("tukar:conn", "kit:" + id);
      } catch {}
      // Best-effort one-click testnet setup: friendbot XLM + USDC trustline + faucet. A
      // transient funding failure must NOT drop the (already established) connection.
      try {
        onStep?.("funding XLM via friendbot…");
        await friendbotFund(addr);
        onStep?.("approve the USDC trustline in your wallet…");
        try {
          await addUsdcTrustline(addr, signer.signTransaction);
        } catch (e: any) {
          if (!/exist|already|low reserve|op_low_reserve/i.test(String(e && e.message))) throw e;
        }
        onStep?.("sending test USDC to your wallet…");
        try {
          await faucetUsdc(addr);
        } catch {}
        onStep?.("wallet ready");
      } catch {
        onStep?.("connected — testnet funding step skipped");
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  // Rehydrate the connection across reloads. Demo key restores instantly; a kit wallet session is
  // re-established SILENTLY (no popup): the kit persists the connected address itself, so getAddress()
  // reads it from memory without touching the wallet. If nothing is cached, we leave it disconnected.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("tukar:conn");
    } catch {}
    if (saved === "demo") {
      connectDemoKey();
    } else if (saved && saved.startsWith("kit:")) {
      const id = saved.slice(4);
      (async () => {
        try {
          const kit = await withTimeout(walletKit(), 8000, "load").catch(() => null);
          if (!kit) return;
          try {
            kit.setWallet(id); // point the kit at the remembered module for later signing
          } catch {
            return; // unknown module id — leave disconnected
          }
          const got = await kit.getAddress().catch(() => null); // silent: reads the kit's cached address
          const addr = got && got.address;
          if (!addr) return;
          setWalletSigner(makeKitSigner(kit, addr));
          setKind(id);
          setWalletName(nameFor(id));
          setAddress(addr);
        } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: WalletState = { connected: kind !== null, kind, walletName, address, connecting, connectWallet, connectDemoKey, disconnect };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used within <WalletProvider>");
  return v;
}

"use client";

// Wallet context for Tukar — ports frontend/wallet.js (Freighter connect/reconnect +
// one-click testnet funding) and the "use testnet key" path from app.js. Exposes an
// explicit connection model (no silent signing): a route gates its on-chain actions on
// `connected`. Wires setWalletSigner() from lib/stellar so deposits/withdraws are signed
// by Freighter when connected, else the built-in throwaway demo key.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  setWalletSigner,
  activeAddress,
  friendbotFund,
  addUsdcTrustline,
  faucetUsdc,
  type WalletSigner,
} from "@/lib/stellar";

const PASSPHRASE = "Test SDF Network ; September 2015";

// Lazy-load @stellar/freighter-api only when needed so a missing extension never breaks boot.
let _api: any = null;
async function freighter(): Promise<any> {
  if (!_api) _api = await import("@stellar/freighter-api");
  return _api.default ?? _api;
}
const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

function makeSigner(f: any, address: string): WalletSigner {
  return {
    address,
    signTransaction: async (xdr: string, opts?: any) => {
      const res = await f.signTransaction(xdr, { networkPassphrase: PASSPHRASE, address, ...(opts || {}) });
      if (res && res.error) throw new Error(res.error);
      return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress || address };
    },
    signAuthEntry: async (xdr: string, opts?: any) => {
      const res = await f.signAuthEntry(xdr, { address, ...(opts || {}) });
      if (res && res.error) throw new Error(res.error);
      return { signedAuthEntry: res.signedAuthEntry, signerAddress: res.signerAddress || address };
    },
  };
}

export type WalletKind = "freighter" | "demo" | null;
export type WalletState = {
  connected: boolean;
  kind: WalletKind;
  address: string | null; // active signer address (Freighter addr or demo key)
  connecting: boolean;
  /** Connect Freighter, install it as signer, and run best-effort testnet funding. */
  connectFreighter: (onStep?: (m: string) => void) => Promise<void>;
  /** Use the built-in throwaway testnet key (real testnet txs, no install). */
  connectDemoKey: () => void;
  disconnect: () => void;
};

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [kind, setKind] = useState<WalletKind>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connectDemoKey = useCallback(() => {
    setWalletSigner(null); // built-in demo key is the default signer
    setKind("demo");
    setAddress(activeAddress());
    try {
      localStorage.setItem("tukar:conn", "demo");
    } catch {}
  }, []);

  const disconnect = useCallback(() => {
    setWalletSigner(null);
    setKind(null);
    setAddress(null);
    try {
      localStorage.removeItem("tukar:conn");
    } catch {}
  }, []);

  const connectFreighter = useCallback(async (onStep?: (m: string) => void) => {
    setConnecting(true);
    try {
      const f: any = await withTimeout(freighter(), 8000, "Freighter library failed to load");
      const conn: any = await withTimeout(f.isConnected(), 3000, "Freighter not detected").catch(() => null);
      if (!(conn && (conn.isConnected ?? conn))) {
        throw new Error("Freighter not detected — install the extension to use your own wallet");
      }
      const access: any = await withTimeout(f.requestAccess(), 60000, "wallet approval timed out");
      if (access && access.error) throw new Error(access.error);
      const addr = (access && access.address) || access;
      if (!addr || typeof addr !== "string") throw new Error("Freighter not available");
      const signer = makeSigner(f, addr);
      setWalletSigner(signer);
      setKind("freighter");
      setAddress(addr);
      try {
        localStorage.setItem("tukar:conn", "freighter");
      } catch {}
      // Best-effort one-click testnet setup: friendbot XLM + USDC trustline + faucet. A
      // transient funding failure must NOT drop the (already established) connection.
      try {
        onStep?.("funding XLM via friendbot…");
        await friendbotFund(addr);
        onStep?.("approve the USDC trustline in Freighter…");
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

  // Rehydrate the connection across reloads. Demo key restores instantly; a Freighter
  // session is re-established SILENTLY (no popup) only if this origin was already granted.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("tukar:conn");
    } catch {}
    if (saved === "demo") {
      connectDemoKey();
    } else if (saved === "freighter") {
      (async () => {
        try {
          const f: any = await withTimeout(freighter(), 8000, "load").catch(() => null);
          if (!f) return;
          const conn: any = await withTimeout(f.isConnected(), 2500, "detect").catch(() => null);
          if (!(conn && (conn.isConnected ?? conn))) return;
          const allowed: any = await withTimeout(f.isAllowed(), 2500, "allowed").catch(() => null);
          if (!(allowed && (allowed.isAllowed ?? allowed))) return; // not yet granted — don't prompt
          const got: any = await withTimeout(f.getAddress(), 3000, "address").catch(() => null);
          const addr = got && (got.address || (typeof got === "string" ? got : null));
          if (!addr) return;
          setWalletSigner(makeSigner(f, addr));
          setKind("freighter");
          setAddress(addr);
        } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: WalletState = { connected: kind !== null, kind, address, connecting, connectFreighter, connectDemoKey, disconnect };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used within <WalletProvider>");
  return v;
}

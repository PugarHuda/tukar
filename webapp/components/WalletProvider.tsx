"use client";

// Wallet context for Tukar. Multi-wallet connect via @creit.tech/stellar-wallets-kit (Freighter,
// xBull, Albedo, Rabet, Lobstr, Hana, Ledger) plus the built-in throwaway demo key ("use testnet key")
// for judges with no wallet. Exposes an explicit connection model (no silent signing): a route gates
// its on-chain actions on `connected`. Wires setWalletSigner() from lib/stellar so deposits/withdraws/
// disclosures are signed by the chosen wallet when connected, else the built-in demo key. The signer
// shape (WalletSigner: address + signTransaction + signAuthEntry) is identical whichever wallet signs.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  setWalletSigner,
  activeAddress,
  friendbotFund,
  addUsdcTrustline,
  faucetUsdc,
  type WalletSigner,
} from "@/lib/stellar";
import { walletKit, onKitEvent, checkNetwork, clearNetworkGuard, assertNetwork, kitError } from "@/lib/wallet-kit";

const PASSPHRASE = "Test SDF Network ; September 2015";

const withTimeout = <T,>(p: Promise<T>, ms: number, msg: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

// Display names for the wallet ids the kit reports (productId). The kit is initialised with exactly
// these seven modules, so the map is complete; the fallback covers any future addition defensively.
const WALLET_NAMES: Record<string, string> = {
  freighter: "Freighter",
  xbull: "xBull",
  albedo: "Albedo",
  rabet: "Rabet",
  lobstr: "Lobstr",
  hana: "Hana",
  LEDGER: "Ledger",
};
const nameFor = (id: string): string => WALLET_NAMES[id] || "wallet";

// Sentry context (no-op without a DSN): who is connected and with which wallet. Never a secret.
function trackWallet(kind: string | null, address: string | null): void {
  Sentry.setUser(address ? { id: address } : null);
  Sentry.setTag("wallet", kind ?? undefined);
}

// A WalletSigner backed by the kit's active module. The kit rejects with { code, message } objects,
// normalised to Errors here; assertNetwork blocks signing while the wallet is off Testnet.
function makeKitSigner(kit: Awaited<ReturnType<typeof walletKit>>, address: string): WalletSigner {
  return {
    address,
    signTransaction: async (xdr: string, opts?: any) => {
      assertNetwork();
      const res = await kit.signTransaction(xdr, { networkPassphrase: PASSPHRASE, address, ...(opts || {}) }).catch((e) => {
        throw kitError(e);
      });
      return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress || address };
    },
    signAuthEntry: async (xdr: string, opts?: any) => {
      assertNetwork();
      const res = await kit.signAuthEntry(xdr, { address, ...(opts || {}) }).catch((e) => {
        throw kitError(e);
      });
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
  /** Human-readable name of the connected wallet ("Freighter", "xBull", "testnet key", ...). */
  walletName: string | null;
  address: string | null; // active signer address (connected wallet addr or demo key)
  connecting: boolean;
  /** Name of the network the wallet reports when it is NOT Testnet (signing is blocked), else null. */
  wrongNetwork: string | null;
  /** Ask the wallet for its network again (after the user switched it). */
  recheckNetwork: () => Promise<void>;
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
  const [wrongNetwork, setWrongNetwork] = useState<string | null>(null);
  // Current kit connection for the event handlers (avoids stale closures), and the unsubscribers.
  const kitConn = useRef<{ kind: string; address: string } | null>(null);
  const unsubs = useRef<Array<() => void>>([]);

  const connectDemoKey = useCallback(() => {
    setWalletSigner(null); // built-in demo key is the default signer
    clearNetworkGuard();
    kitConn.current = null;
    setKind("demo");
    setWalletName("testnet key");
    setAddress(activeAddress());
    setWrongNetwork(null);
    trackWallet("demo", activeAddress());
    try {
      localStorage.setItem("tukar:conn", "demo");
    } catch {}
  }, []);

  const disconnect = useCallback(() => {
    setWalletSigner(null);
    clearNetworkGuard();
    kitConn.current = null;
    setKind(null);
    setWalletName(null);
    setAddress(null);
    setWrongNetwork(null);
    trackWallet(null, null);
    try {
      localStorage.removeItem("tukar:conn");
    } catch {}
    // No kit.disconnect() needed: rehydrate is gated on our own "tukar:conn" key (removed above),
    // so the kit's remembered session is never resurrected. Avoids loading the kit bundle on disconnect.
  }, []);

  // Install a kit wallet as the active signer and record it (state, storage, Sentry).
  const installKitWallet = useCallback((kit: Awaited<ReturnType<typeof walletKit>>, id: string, addr: string) => {
    setWalletSigner(makeKitSigner(kit, addr));
    kitConn.current = { kind: id, address: addr };
    setKind(id);
    setWalletName(nameFor(id));
    setAddress(addr);
    trackWallet(id, addr);
    try {
      localStorage.setItem("tukar:conn", "kit:" + id);
    } catch {}
  }, []);

  // Kit events, subscribed once per provider: account switch refreshes the address + signer, a
  // wallet-side disconnect clears our state. STATE_UPDATED also fires on subscribe with the current
  // values, so it is a no-op unless the address actually differs from our kit connection.
  const subscribeKit = useCallback(async (kit: Awaited<ReturnType<typeof walletKit>>) => {
    if (unsubs.current.length) return;
    unsubs.current = await Promise.all([
      onKitEvent("STATE_UPDATED", ({ address: next }) => {
        const cur = kitConn.current;
        if (!cur || !next || next === cur.address) return;
        installKitWallet(kit, cur.kind, next);
      }),
      onKitEvent("DISCONNECT", () => {
        if (kitConn.current) disconnect();
      }),
    ]);
  }, [installKitWallet, disconnect]);
  useEffect(
    () => () => {
      for (const u of unsubs.current) u();
      unsubs.current = [];
    },
    [],
  );

  const recheckNetwork = useCallback(async () => {
    if (!kitConn.current) return;
    setWrongNetwork(await checkNetwork(await walletKit()));
  }, []);

  const connectWallet = useCallback(async (onStep?: (m: string) => void) => {
    setConnecting(true);
    try {
      const kit = await withTimeout(walletKit(), 8000, "wallet kit failed to load");
      // Opens the kit modal; the user picks a wallet and grants access. authModal sets that wallet as
      // the active module and returns its address, or rejects if the user cancels.
      const { address: addr } = await kit.authModal().catch((e) => {
        throw kitError(e);
      });
      if (!addr || typeof addr !== "string") throw new Error("no wallet selected");
      const id = (() => {
        try {
          return kit.selectedModule.productId;
        } catch {
          return "wallet";
        }
      })();
      installKitWallet(kit, id, addr);
      await subscribeKit(kit);
      // Network guard: the wallet must be on Testnet before anything is signed.
      const wrong = await checkNetwork(kit);
      setWrongNetwork(wrong);
      if (wrong) {
        onStep?.(`connected, but the wallet is on ${wrong}; switch it to Testnet`);
        return;
      }
      // Best-effort one-click testnet setup: friendbot XLM + USDC trustline + faucet. A
      // transient funding failure must NOT drop the (already established) connection.
      try {
        onStep?.("funding XLM via friendbot…");
        await friendbotFund(addr);
        onStep?.("approve the USDC trustline in your wallet…");
        try {
          await addUsdcTrustline(addr, makeKitSigner(kit, addr).signTransaction);
        } catch (e: any) {
          if (!/exist|already|low reserve|op_low_reserve/i.test(String(e && e.message))) throw e;
        }
        onStep?.("sending test USDC to your wallet…");
        try {
          await faucetUsdc(addr);
        } catch {}
        onStep?.("wallet ready");
      } catch {
        onStep?.("connected, testnet funding step skipped");
      }
    } finally {
      setConnecting(false);
    }
  }, [installKitWallet, subscribeKit]);

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
            return; // unknown module id, leave disconnected
          }
          const got = await kit.getAddress().catch(() => null); // silent: reads the kit's cached address
          const addr = got && got.address;
          if (!addr) return;
          installKitWallet(kit, id, addr);
          await subscribeKit(kit);
          setWrongNetwork(await checkNetwork(kit));
        } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: WalletState = {
    connected: kind !== null,
    kind,
    walletName,
    address,
    connecting,
    wrongNetwork,
    recheckNetwork,
    connectWallet,
    connectDemoKey,
    disconnect,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used within <WalletProvider>");
  return v;
}

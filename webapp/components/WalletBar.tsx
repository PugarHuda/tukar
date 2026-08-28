"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { Button, StatusPill, useToast } from "@/components/ui";
import { IdosConnect } from "@/components/idos/IdosConnect";
import { Mark } from "@/components/sender/Label";

const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

// Typed disclosure line on the label strip: Courier caps, ink, a drawn chevron that turns.
const SUMMARY =
  "inline-flex cursor-pointer list-none items-center gap-1 text-ink-2 underline underline-offset-2 transition-colors duration-clock ease-clock hover:text-stamp [&::-webkit-details-marker]:hidden";
const CHEVRON = "transition-transform duration-clock ease-clock group-open:rotate-180";

type AllowlistInfo = {
  alreadyListed: boolean;
  leafIndex: number;
  newRootHex: string;
  setAspRootCli: string;
};

type ReclaimState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "not-configured" }
  | { phase: "pending"; requestUrl: string }
  | { phase: "verifying" }
  | { phase: "verified"; identity?: string; allowlist?: AllowlistInfo }
  | { phase: "error"; message: string };

// Pull a human-readable identity (Gmail address) out of the verified proof's extracted params.
function readIdentity(ctx: any): string | undefined {
  const params = ctx?.extractedParameters;
  if (!params || typeof params !== "object") return undefined;
  const v = params.email ?? params.emailAddress ?? params.username ?? Object.values(params)[0];
  return typeof v === "string" ? v : undefined;
}

/**
 * Mints a Reclaim proof request server-side, opens the portal, polls the session status URL for the
 * returned proof, then POSTs that proof to /api/reclaim/verify for authoritative cryptographic
 * verification. The client never decides the outcome itself.
 */
function ReclaimVerify() {
  const { address } = useWallet();
  const { toast } = useToast();
  const [state, setState] = useState<ReclaimState>({ phase: "idle" });
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPolling, []);

  // The server binds the proof to the address given at init and re-checks it here: same account.
  async function submitForVerify(proof: unknown) {
    setState({ phase: "verifying" });
    try {
      const res = await fetch("/api/reclaim/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof, address }),
      });
      const data = await res.json();
      if (data.verified)
        setState({ phase: "verified", identity: readIdentity(data.context), allowlist: data.allowlist ?? undefined });
      else setState({ phase: "error", message: data.error || "The proof did not verify." });
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Verify request failed" });
    }
  }

  // ponytail: 3s poll, 5-min ceiling; swap for the SDK's startSession callback if we ever bundle it client-side.
  function startPolling(statusUrl: string) {
    stopPolling();
    const started = Date.now();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - started > 5 * 60_000) {
        stopPolling();
        setState({ phase: "error", message: "Timed out waiting for the proof. Try again." });
        return;
      }
      try {
        const res = await fetch(statusUrl, { cache: "no-store" });
        const session = (await res.json())?.session;
        if (session?.error) {
          stopPolling();
          return setState({ phase: "error", message: "Proof generation failed in the portal." });
        }
        const proof = session?.proofs?.[0];
        if (proof) {
          stopPolling();
          await submitForVerify(proof);
        }
      } catch {
        // transient network/CORS hiccup; keep polling until the timeout ceiling.
      }
    }, 3000);
  }

  // Init needs the connected G-address: the server bakes it into the proof's signed context.
  async function verify() {
    if (!address) return setState({ phase: "error", message: "Connect a wallet first; the proof is bound to your account." });
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/reclaim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) });
      const data = await res.json();
      if (data.configured === false) return setState({ phase: "not-configured" });
      if (data.error || !data.requestUrl) return setState({ phase: "error", message: data.error || "No request URL returned" });
      window.open(data.requestUrl, "_blank", "noopener,noreferrer");
      setState({ phase: "pending", requestUrl: data.requestUrl });
      if (data.statusUrl) startPolling(data.statusUrl);
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Request failed" });
    }
  }

  return (
    <div className="mt-2 text-left">
      {state.phase !== "verified" && (
        <Button variant="subtle" busy={state.phase === "loading" || state.phase === "verifying"} onClick={verify}>
          {state.phase === "verifying" ? "Verifying proof" : "Verify with Reclaim"}
        </Button>
      )}
      {state.phase === "not-configured" && (
        <p className="mt-1 leading-relaxed text-ink-3">Reclaim is not configured on this deployment yet.</p>
      )}
      {state.phase === "pending" && (
        <p className="mt-1 leading-relaxed text-ink-2">
          Complete proof-of-personhood on your phone in the tab that opened (or{" "}
          <a href={state.requestUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-stamp">
            reopen it
          </a>
          ). This page is waiting for the proof and will verify it automatically.
        </p>
      )}
      {state.phase === "verified" && (
        <div className="mt-1 leading-relaxed">
          <p className="inline-flex items-center gap-1 font-semibold text-stamp-deep">
            <Mark kind="check" size={12} /> Verified with Reclaim
          </p>
          <p className="mt-1 text-ink-2">
            A Gmail identity{state.identity ? <> (<code className="text-stamp-deep">{state.identity}</code>)</> : null} was
            proven with a zkTLS proof, verified cryptographically on our server.
          </p>
          {!address && (
            <p className="mt-2 text-ink-3">
              Connect a wallet to compute this account&apos;s ASP allow-list entry.
            </p>
          )}
          {address && !state.allowlist && (
            <p className="mt-2 text-ink-3">Computing the allow-list update for {shortAddr(address)}…</p>
          )}
          {state.allowlist?.alreadyListed && (
            <p className="mt-2 text-ink-2">
              This account is already on the ASP allow-list (leaf #{state.allowlist.leafIndex}). It can deposit now; no
              admin action needed.
            </p>
          )}
          {state.allowlist && !state.allowlist.alreadyListed && (
            <div className="mt-2">
              <p className="text-ink-2">
                Identity verified. To enable deposits, the corridor operator applies this on-chain (admin-gated,{" "}
                <code className="text-stamp-deep">set_asp_root</code>). The new allow-list root and updated witness are
                already computed server-side; nothing here is signed.
              </p>
              <div className="mt-2 flex items-start gap-2">
                <pre className="flex-1 overflow-x-auto rounded-tile border border-ink/45 bg-input p-2 font-mono text-[11px] leading-relaxed text-ink-2 shadow-inset">
                  {state.allowlist.setAspRootCli}
                </pre>
                <Button
                  variant="ghost"
                  onClick={() =>
                    navigator.clipboard.writeText(state.allowlist!.setAspRootCli).then(
                      () => toast("set_asp_root CLI copied", "success"),
                      () => toast("Copy failed; select the command and copy it manually", "error"),
                    )
                  }
                >
                  Copy
                </Button>
              </div>
              <p className="mt-1 text-ink-3">
                Until the operator runs this, deposits stay gated by the current allow-list, so this account cannot
                deposit yet.
              </p>
            </div>
          )}
        </div>
      )}
      {state.phase === "error" && <p className="mt-1 leading-relaxed text-tape-deep">Reclaim error: {state.message}</p>}
    </div>
  );
}

/** Connect bar: built-in testnet key OR any supported Stellar wallet. The typed strip at the top
 *  of every route: who signs, on which network, and the reusable-KYC disclosure. */
export function WalletBar() {
  const { connected, walletName, address, connecting, wrongNetwork, recheckNetwork, connectWallet, connectDemoKey, disconnect } =
    useWallet();
  const { toast } = useToast();
  // The connected strip renders Disconnect where "Use testnet key" just was, so the second half of
  // an accidental double-tap would disconnect the wallet it just connected. Disconnect stays
  // disabled for the first moment after connecting; a deliberate click a second later works.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!connected) {
      setArmed(false);
      return;
    }
    const t = setTimeout(() => setArmed(true), 600);
    return () => clearTimeout(t);
  }, [connected]);

  if (connected && address) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="font-mono text-xs text-ink-2">
            {walletName || "wallet"} · <b className="text-stamp-deep">{shortAddr(address)}</b>
          </span>
          <Button variant="ghost" disabled={!armed} onClick={disconnect}>
            Disconnect
          </Button>
        </div>
        {wrongNetwork && (
          <p role="alert" className="flex flex-wrap items-center justify-end gap-2 text-right text-[11px] leading-snug text-tape-deep">
            Your wallet is on {wrongNetwork}; switch it to Testnet. Signing is blocked until it matches.
            <Button variant="subtle" onClick={() => recheckNetwork().catch(() => {})}>
              Re-check
            </Button>
          </p>
        )}
        <details className="group w-full text-right font-mono text-[11px] leading-snug text-ink-3">
          <summary className={SUMMARY}>
            Verify identity to enable deposits (idOS or Reclaim)
            <Mark kind="chevron" size={12} className={CHEVRON} />
          </summary>
          <IdosConnect />
          <ReclaimVerify />
        </details>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <StatusPill tone="green" label="testnet" />
      <Button
        variant="ghost"
        busy={connecting}
        onClick={() =>
          connectWallet((m) => toast(m)).catch((e) =>
            toast((e && e.message) || "Could not connect a wallet. Pick one, or use the testnet key.", "error"),
          )
        }
      >
        Connect wallet
      </Button>
      <Button variant="subtle" onClick={connectDemoKey}>
        Use testnet key
      </Button>
      <span className="w-full text-right text-[11px] leading-snug text-ink-3">
        Testing with others? Connect your own wallet (Freighter, xBull, Albedo, Rabet, Lobstr, Hana, Ledger) for your own key; the built-in testnet key is shared.
      </span>
      <details className="group w-full text-right font-mono text-[11px] leading-snug text-ink-3">
        <summary className={SUMMARY}>
          Reusable KYC
          <Mark kind="chevron" size={12} className={CHEVRON} />
        </summary>
        <p className="mt-1 text-left leading-relaxed">
          Verify identity once and reuse it: connect a wallet, then reuse an existing{" "}
          <a href="https://idos.network" target="_blank" rel="noopener noreferrer" className="text-ink-2 underline hover:text-stamp">
            idOS
          </a>{" "}
          KYC credential (reusable KYC, live on Stellar), or prove personhood with{" "}
          <a href="https://reclaimprotocol.org" target="_blank" rel="noopener noreferrer" className="text-ink-2 underline hover:text-stamp">
            Reclaim
          </a>{" "}
          (zkTLS, live on Stellar). The result populates the ASP allow-list, so a user proves
          compliance once and reuses it across corridors, and Tukar never holds KYC data itself.
        </p>
        <IdosConnect />
        <ReclaimVerify />
      </details>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { Button, StatusPill, useToast } from "@/components/ui";

const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

type ReclaimState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "not-configured" }
  | { phase: "pending"; requestUrl: string }
  | { phase: "verifying" }
  | { phase: "verified"; identity?: string }
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
  const [state, setState] = useState<ReclaimState>({ phase: "idle" });
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPolling, []);

  async function submitForVerify(proof: unknown, providerVersion?: string) {
    setState({ phase: "verifying" });
    try {
      const res = await fetch("/api/reclaim/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof, providerVersion }),
      });
      const data = await res.json();
      if (data.verified) setState({ phase: "verified", identity: readIdentity(data.context) });
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
          await submitForVerify(proof, session?.providerVersionString);
        }
      } catch {
        // transient network/CORS hiccup; keep polling until the timeout ceiling.
      }
    }, 3000);
  }

  async function verify() {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/reclaim", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
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
        <p className="mt-1 leading-relaxed text-tf">Reclaim is not configured on this deployment yet.</p>
      )}
      {state.phase === "pending" && (
        <p className="mt-1 leading-relaxed text-tm">
          Complete proof-of-personhood on your phone in the tab that opened (or{" "}
          <a href={state.requestUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-orange">
            reopen it
          </a>
          ). This page is waiting for the proof and will verify it automatically.
        </p>
      )}
      {state.phase === "verified" && (
        <div className="mt-1 leading-relaxed">
          <p className="font-semibold text-green-t">✓ Verified with Reclaim</p>
          <p className="mt-1 text-tm">
            A Gmail identity{state.identity ? <> (<code className="text-orange">{state.identity}</code>)</> : null} was
            proven with a zkTLS proof, verified cryptographically on our server. Next step (roadmap): the admin adds this
            account to the ASP allow-list on-chain (<code className="text-orange">set_asp_root</code>). It is not
            allow-listed yet.
          </p>
        </div>
      )}
      {state.phase === "error" && <p className="mt-1 leading-relaxed text-red-t">Reclaim error: {state.message}</p>}
    </div>
  );
}

/** Connect bar: built-in testnet key OR Freighter. Reusable across every route. */
export function WalletBar() {
  const { connected, kind, address, connecting, connectFreighter, useDemoKey, disconnect } = useWallet();
  const { toast } = useToast();

  if (connected && address) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="font-mono text-xs text-tm">
          {kind === "demo" ? "testnet key" : "Freighter"} · <b className="text-green-t">{shortAddr(address)}</b>
        </span>
        <Button variant="ghost" onClick={disconnect}>
          Disconnect
        </Button>
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
          connectFreighter().catch((e) =>
            toast((e && e.message) || "Freighter not detected. Install it, or use the testnet key.", "error"),
          )
        }
      >
        Connect wallet
      </Button>
      <Button variant="subtle" onClick={useDemoKey}>
        Use testnet key
      </Button>
      <span className="w-full text-right text-[11px] leading-snug text-tf">
        Testing with others? Connect Freighter for your own key (the built-in testnet key is shared).
      </span>
      <details className="w-full text-right font-mono text-[11px] leading-snug text-tf">
        <summary className="cursor-pointer list-none text-tm hover:text-orange">
          Reusable KYC <span className="text-tf">(roadmap)</span>
        </summary>
        <p className="mt-1 text-left leading-relaxed">
          <b className="text-orange">Roadmap, not wired yet.</b> Onboarding will verify identity once
          through{" "}
          <a
            href="https://idos.network"
            target="_blank"
            rel="noopener noreferrer"
            className="text-tm underline hover:text-orange"
          >
            idOS
          </a>{" "}
          (reusable KYC, live on Stellar) and{" "}
          <a
            href="https://reclaimprotocol.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-tm underline hover:text-orange"
          >
            Reclaim
          </a>{" "}
          (zkTLS proof-of-personhood, live on Stellar). That result populates the ASP allow-list, so a
          user proves compliance once and reuses it across corridors, and Tukar never holds KYC data
          itself.
        </p>
        <ReclaimVerify />
      </details>
    </div>
  );
}

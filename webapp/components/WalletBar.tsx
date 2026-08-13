"use client";

import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { Button, StatusPill, useToast } from "@/components/ui";

const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

type ReclaimState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "not-configured" }
  | { phase: "pending"; requestUrl: string }
  | { phase: "error"; message: string };

/** POSTs to the server route that mints a Reclaim proof-of-personhood request. */
function ReclaimVerify() {
  const [state, setState] = useState<ReclaimState>({ phase: "idle" });

  async function verify() {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/reclaim", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (data.configured === false) return setState({ phase: "not-configured" });
      if (data.error || !data.requestUrl) return setState({ phase: "error", message: data.error || "No request URL returned" });
      window.open(data.requestUrl, "_blank", "noopener,noreferrer");
      setState({ phase: "pending", requestUrl: data.requestUrl });
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Request failed" });
    }
  }

  return (
    <div className="mt-2 text-left">
      <Button variant="subtle" busy={state.phase === "loading"} onClick={verify}>
        Verify with Reclaim
      </Button>
      {state.phase === "not-configured" && (
        <p className="mt-1 leading-relaxed text-tf">Reclaim is not configured on this deployment yet.</p>
      )}
      {state.phase === "pending" && (
        <p className="mt-1 leading-relaxed text-tm">
          Complete proof-of-personhood on your phone in the tab that opened (or{" "}
          <a href={state.requestUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-orange">
            reopen it
          </a>
          ). Once approved, the admin adds your account to the ASP allow-list (<code className="text-orange">set_asp_root</code>).
        </p>
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

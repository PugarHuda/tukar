"use client";

import { useWallet } from "@/components/WalletProvider";
import { Button, StatusPill, useToast } from "@/components/ui";

const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

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
      </details>
    </div>
  );
}

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
    </div>
  );
}

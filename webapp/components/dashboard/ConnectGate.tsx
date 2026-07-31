"use client";

import { useWallet } from "@/components/WalletProvider";
import { Button, useToast } from "@/components/ui";

// Console access gate. The Regulator and Operator dashboards render this instead of their
// content until a wallet is connected, so nothing shows before connect. The built-in key
// is one tap (a throwaway testnet key), or connect Freighter.
export function ConnectGate({ name }: { name: string }) {
  const { connectFreighter, useDemoKey, connecting } = useWallet();
  const { toast } = useToast();
  return (
    <div className="mx-auto flex min-h-[62vh] max-w-[560px] flex-col items-center justify-center px-6 text-center">
      <div className="w-full rounded-tile border border-white/10 bg-white/[0.02] p-8">
        <p className="tk-eyebrow mb-2 font-mono text-[11px] tracking-[0.2em] text-orange uppercase">
          Locked
        </p>
        <h1 className="text-[clamp(22px,2.6vw,32px)] font-extrabold leading-tight tracking-[-0.025em]">
          Connect to open the {name}
        </h1>
        <p className="mx-auto mt-3 max-w-[430px] text-sm leading-relaxed text-tm">
          This console reads live data and signs actions against Stellar testnet. Connect to
          continue. The built-in key is a throwaway testnet key, no install and no seed phrase.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="subtle" onClick={useDemoKey}>
            Use built-in testnet key
          </Button>
          <Button
            busy={connecting}
            onClick={() =>
              connectFreighter().catch((e) =>
                toast(e?.message || "Freighter connect failed", "error"),
              )
            }
          >
            Connect Freighter
          </Button>
        </div>
      </div>
    </div>
  );
}

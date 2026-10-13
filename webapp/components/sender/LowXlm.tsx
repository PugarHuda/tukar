"use client";
// Shown on the send step when the signing wallet holds under 2 XLM: you pay the network fee yourself
// (Tukar runs no fee sponsor), so on testnet the fix is friendbot, called from this browser for YOUR
// address. Renders nothing while the balance is unknown or comfortable.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { NOTICE } from "@/components/sender/Label";
import { activeAddress } from "@/lib/stellar";
import { makeServer } from "@/lib/soroban/rpc";
import { short } from "@/lib/zk";

export const LOW_XLM = 2;

/** XLM balance of an account, or null when it does not exist on testnet yet. */
async function xlmBalance(address: string): Promise<number | null> {
  try {
    return Number((await makeServer().getAccountEntry(address)).balance) / 1e7;
  } catch {
    return null;
  }
}

export function LowXlm({ address, className = "" }: { address: string | null; className?: string }) {
  const signer = address || activeAddress();
  const [xlm, setXlm] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let live = true;
    setXlm(undefined);
    setMsg("");
    xlmBalance(signer).then((b) => live && setXlm(b));
    return () => {
      live = false;
    };
  }, [signer]);

  if (xlm === undefined || (xlm !== null && xlm >= LOW_XLM)) return null;

  async function fund() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(signer)}`);
      if (r.ok) {
        setMsg("Friendbot sent testnet XLM.");
        setXlm(await xlmBalance(signer));
      } else {
        // Friendbot only creates accounts; an account that already exists is refused.
        setMsg(`Friendbot refused (HTTP ${r.status}). It only funds accounts that do not exist yet; top up from another testnet wallet instead.`);
      }
    } catch {
      setMsg("Could not reach friendbot.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${NOTICE} ${className}`} role="status">
      <b className="text-ink">Low XLM.</b> {xlm === null ? `${short(signer)} is not funded on testnet yet.` : `${short(signer)} holds ${xlm.toFixed(2)} XLM.`} You pay the network fee for your deposit yourself, so keep at least {LOW_XLM} XLM.
      <div className="mt-2">
        <Button variant="subtle" busy={busy} disabled={busy} onClick={fund}>
          Get testnet XLM (friendbot)
        </Button>
      </div>
      {msg && <p className="mt-2">{msg}</p>}
    </div>
  );
}

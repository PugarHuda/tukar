"use client";
// "Pay network fee for me": shows whether the server's fee sponsor is configured (and if not, the
// exact env var it lacks), reads the signer's XLM, and turns sponsorship on by itself when the
// wallet holds too little XLM to pay a deposit's fee. The send itself is in app/sender/page.tsx.
import { useEffect, useState } from "react";
import { Label, Ext, TYPED, NOTICE } from "@/components/sender/Label";
import { short } from "@/lib/zk";
import { activeAddress } from "@/lib/stellar";
import { sponsorStatus, xlmBalance, LOW_XLM, type SponsorStatus } from "@/components/sender/sponsor";

const acct = (a: string) => `https://stellar.expert/explorer/testnet/account/${a}`;

export function FeeSponsor({ address, on, setOn, className = "" }: { address: string | null; on: boolean; setOn: (v: boolean) => void; className?: string }) {
  const [status, setStatus] = useState<SponsorStatus | null>(null);
  const [xlm, setXlm] = useState<number | null | undefined>(undefined);
  const signer = address || activeAddress();

  useEffect(() => {
    let live = true;
    sponsorStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    setXlm(undefined);
    xlmBalance(signer).then((b) => live && setXlm(b));
    return () => {
      live = false;
    };
  }, [signer]);

  const available = status?.available === true;
  const low = typeof xlm === "number" && xlm < LOW_XLM;
  useEffect(() => {
    if (available && low) setOn(true);
    if (status && !available) setOn(false);
  }, [available, low, status, setOn]);

  return (
    <Label bar="Network fee" right={available ? "sponsor live" : status ? "sponsor off" : "checking"} className={className}>
      <label className={`flex items-center gap-2 text-sm text-ink ${available ? "cursor-pointer" : "opacity-60"}`}>
        <input type="checkbox" checked={on} disabled={!available} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 accent-stamp" />
        Pay network fee for me
      </label>
      <p className={`mt-2 ${TYPED}`}>
        {xlm === undefined ? "Reading your XLM…" : xlm === null ? `${short(signer)} is not funded on testnet yet.` : `${short(signer)} holds ${xlm.toFixed(2)} XLM.`}
        {low && available ? ` That is under the ~${LOW_XLM} XLM a deposit can reserve for fees, so the sponsor is on.` : ""}
      </p>
      {status && !available && <p className={`mt-2 ${NOTICE}`}>Fee sponsor unavailable: {status.error}</p>}
      {status?.available && (
        <p className={`mt-2 ${TYPED}`}>
          Sponsor <Ext href={acct(status.sponsor)}>{short(status.sponsor)}</Ext>
          {status.balanceXlm != null ? ` (${Number(status.balanceXlm).toFixed(2)} XLM)` : ""} pays the fee with a fee-bump. You still sign the deposit, and it stays on-chain under your
          address (deposits are public by design); only the fee payer changes.
        </p>
      )}
    </Label>
  );
}

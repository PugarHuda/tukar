"use client";
// The sender's self-set spending guard on the compose label: a daily and monthly USDC cap, what
// went out today and this month (from the device's Sent notes store, real deposits only), and the
// block-with-override when the amount in the form would cross the cap. Honest about enforcement:
// a direct send is signed by this wallet in this browser, so the device guard can only advise the
// person holding the key; the scheduler's copy (server mode, wallet-signed) is enforced by the cron
// before every automatic deposit.
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { Label, CAP, TYPED } from "@/components/sender/Label";
import { parseGuard, type SpendingGuard as Guard, type Spent } from "@/lib/spending-guard";

const f = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function SpendingGuard(props: {
  guard: Guard;
  spent: Spent;
  /** The amount in the form (NaN when empty) and the verdict the page computed for it. */
  amount: number;
  amountText: string;
  blocked: string | null; // the guard's reason when the amount would exceed it, else null
  overridden: boolean;
  onOverride: () => void;
  onSave: (g: Guard) => Promise<void>;
  serverMode: boolean | null;
  signedIn: boolean;
}) {
  const { guard, spent, amountText, blocked, overridden, onOverride, onSave, serverMode, signedIn } = props;
  const [daily, setDaily] = useState(guard.daily != null ? String(guard.daily) : "");
  const [monthly, setMonthly] = useState(guard.monthly != null ? String(guard.monthly) : "");
  const [retyped, setRetyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    setDaily(guard.daily != null ? String(guard.daily) : "");
    setMonthly(guard.monthly != null ? String(guard.monthly) : "");
  }, [guard.daily, guard.monthly]);
  useEffect(() => setRetyped(""), [amountText]); // a changed amount needs a fresh override

  async function save() {
    const g = parseGuard({ daily, monthly });
    if (!g) {
      setErr("Caps must be positive USDC amounts, and the daily cap no higher than the monthly one.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      await onSave(g);
    } finally {
      setBusy(false);
    }
  }

  const hasCap = guard.daily != null || guard.monthly != null;
  return (
    <Label className="mt-4" bar="Spending guard" right={hasCap ? (serverMode && signedIn ? "device + scheduler" : "this device") : "not set"}>
      <div className="font-mono text-sm font-bold tabular-nums text-ink" aria-live="polite">
        Today: {f(spent.today)} of {guard.daily != null ? f(guard.daily) : "no cap"} USDC
      </div>
      <div className={`mt-0.5 ${TYPED}`}>
        This month: {f(spent.month)} of {guard.monthly != null ? f(guard.monthly) : "no cap"} USDC. Counted from the notes this device sent (the Sent notes list); refunded sends still count.
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Input label="Daily cap (USDC)" id="guard-daily" type="number" inputMode="decimal" min={0} step={1} value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="none" aria-label="Daily spending cap in USDC" />
        <Input label="Monthly cap (USDC)" id="guard-monthly" type="number" inputMode="decimal" min={0} step={1} value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="none" aria-label="Monthly spending cap in USDC" />
      </div>
      <Button variant="subtle" className="mt-3" busy={busy} onClick={save}>
        Save guard
      </Button>
      {err && <p className="mt-2 text-[12px] leading-relaxed text-tape-deep">{err}</p>}
      <p className={`mt-2 ${TYPED}`}>
        A device guard is advisory: it lives in this browser&apos;s storage, clearing site data removes it, and you can override it below.
        {serverMode
          ? signedIn
            ? " It is also saved with your wallet-signed plans, and the scheduler refuses an automatic deposit that would cross it."
            : " Connect a wallet to save it with your scheduled plans too, where the scheduler enforces it."
          : ""}
      </p>

      {blocked && (
        <div className="mt-3 border-t border-ink/25 pt-3">
          <p className="text-[12.5px] leading-relaxed text-tape-deep" role="alert">
            {blocked}
          </p>
          {overridden ? (
            <p className={`mt-2 ${TYPED}`}>Override on for {amountText} USDC. Continue is unlocked for this amount only.</p>
          ) : (
            <>
              <div className={`mt-2 ${CAP}`}>Type {amountText} to send anyway</div>
              <div className="mt-1.5 flex gap-2">
                <Input id="guard-override" inputMode="decimal" value={retyped} onChange={(e) => setRetyped(e.target.value)} placeholder={amountText} aria-label="Retype the amount to override the spending guard" className="mt-0 font-mono" />
                <Button variant="ghost" disabled={retyped.trim() !== amountText} onClick={onOverride}>
                  Override
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Label>
  );
}

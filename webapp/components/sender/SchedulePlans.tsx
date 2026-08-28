"use client";
// The sender's "Scheduled sends" list. Tap a plan to pre-fill it; Cancel removes it (server mode:
// confirm, then DELETE /api/schedules/[id] with the scheduler bearer token, so the cron never runs
// it again; local mode: the device reminder is dropped). Each server run that minted a note shows
// it as a copyable "Claim note" (same reveal/copy pattern as the success screen) so the owner can
// hand it to the recipient; without that string a scheduled deposit is unspendable.
import { useState } from "react";
import { txExplorer } from "@/lib/stellar";
import { short } from "@/lib/zk";
import { Button, useToast } from "@/components/ui";

export type PlanRun = { at: string; depHash?: string; regOk?: boolean; error?: string; note?: string };
export type SchedulePlan = { id: string; amount: string; code: string; recipient: string; frequency: "weekly" | "monthly"; nextDate: string; history?: PlanRun[] };

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export function SchedulePlans(props: {
  schedules: SchedulePlan[];
  /** true = server scheduler (cron runs plans on-chain); false/null = device-local reminders. */
  serverMode: boolean | null;
  /** Scheduler bearer token from sign-in-with-wallet; required to cancel in server mode. */
  token: string | null;
  corridors: { code: string; country: string }[];
  onPrefill: (s: SchedulePlan) => void;
  /** Called once a plan is gone (after the server DELETE succeeded, or immediately in local mode). */
  onRemoved: (id: string) => void;
}) {
  const { schedules, serverMode, token, corridors, onPrefill, onRemoved } = props;
  const { toast } = useToast();
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function cancel(id: string) {
    if (!serverMode) {
      onRemoved(id);
      return;
    }
    if (!token) {
      setErrors((e) => ({ ...e, [id]: "Connect a wallet to cancel (it signs you in)." }));
      return;
    }
    if (!window.confirm("Cancel this scheduled send? The cron will not run it again.")) return;
    setErrors((e) => ({ ...e, [id]: "" }));
    setCancelingId(id);
    try {
      const r = await fetch(`/api/schedules/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (j?.ok) {
        onRemoved(id);
        toast("Plan cancelled.", "success");
      } else {
        setErrors((e) => ({ ...e, [id]: j?.error || "Could not cancel the plan." }));
      }
    } catch {
      setErrors((e) => ({ ...e, [id]: "Could not reach the scheduler." }));
    } finally {
      setCancelingId(null);
    }
  }

  if (schedules.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-[10px] tracking-[0.12em] text-tf uppercase">Scheduled sends</div>
        <span className="font-mono text-[10px] text-tf">{serverMode ? "runs on-chain daily" : "saved on this device"}</span>
      </div>
      <div className="flex flex-col gap-2">
        {schedules.map((s) => {
          const sc = corridors.find((c) => c.code === s.code);
          const last = s.history && s.history[0];
          return (
            <div key={s.id} className="rounded-tile border border-line bg-black/20 p-3">
              <div className="flex items-center gap-3">
                <button onClick={() => onPrefill(s)} className="min-w-0 flex-1 text-left" title="Tap to pre-fill this plan for a manual send.">
                  <div className="truncate text-sm font-semibold text-tp">
                    ${s.amount} USDC · {sc ? sc.country : s.code}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-tf">
                    {s.frequency} · to {s.recipient || "recipient"} · next {fmtDate(s.nextDate)}
                  </div>
                </button>
                <button
                  onClick={() => cancel(s.id)}
                  disabled={cancelingId !== null}
                  aria-label={serverMode ? "Cancel scheduled plan" : "Remove scheduled plan"}
                  className="shrink-0 rounded-md border border-line-input px-2 py-1 font-mono text-[11px] text-tm transition-colors hover:border-red/50 hover:text-red-t disabled:opacity-60 disabled:hover:border-line-input disabled:hover:text-tm"
                >
                  {cancelingId === s.id ? "Cancelling…" : serverMode ? "Cancel" : "Remove"}
                </button>
              </div>
              {/* Link lives outside the prefill button: an <a> inside a <button> is invalid markup. */}
              {last && (
                <div className="mt-1 truncate font-mono text-[11px]">
                  {last.depHash ? (
                    <a
                      href={txExplorer(last.depHash)}
                      target="_blank"
                      rel="noreferrer"
                      className={last.regOk ? "text-green-t underline underline-offset-2" : "text-orange underline underline-offset-2"}
                    >
                      last run: tx {short(last.depHash)} {last.regOk ? "✓" : "· registering"}
                    </a>
                  ) : (
                    <span className="text-red-t">last run failed: {last.error || "unknown error"}</span>
                  )}
                </div>
              )}
              {errors[s.id] && <p className="mt-1.5 text-[12px] leading-relaxed text-orange break-words">{errors[s.id]}</p>}
              {last?.note && <ClaimNote note={last.note} at={last.at} />}
            </div>
          );
        })}
      </div>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-tf">
        {serverMode
          ? "Runs daily on-chain: each due plan's deposit and shielded-tree registration execute automatically. Handing the claim note to the recipient (the withdraw leg) stays the next step."
          : "Reminders only. Tap a plan to pre-fill the form, then send it yourself. No money moves automatically."}
      </p>
    </div>
  );
}

// Hidden until revealed: whoever holds the string can claim the payment, so it is not painted on
// screen by default. Copy works without revealing it.
function ClaimNote({ note, at }: { note: string; at: string }) {
  const { toast } = useToast();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(note).then(
      () => {
        setCopied(true);
        toast("Claim note copied", "success");
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast("Could not copy. Reveal it and copy by hand.", "error"),
    );
  }
  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-[0.12em] text-tf uppercase">Claim note (bearer)</div>
          <div className="truncate font-mono text-[10px] text-tf">from the run on {new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · share only with the recipient</div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="subtle" onClick={() => setShown((v) => !v)}>
            {shown ? "Hide" : "Reveal"}
          </Button>
          <Button variant="ghost" onClick={copy}>
            {copied ? "Copied ✓" : "Copy"}
          </Button>
        </div>
      </div>
      {shown && <div className="mt-2 rounded-md border border-line bg-black/30 p-2 font-mono text-[10px] leading-relaxed text-tp break-all">{note}</div>}
    </div>
  );
}

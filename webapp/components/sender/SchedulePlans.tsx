"use client";
// The sender's "Scheduled sends": standing orders on a slip. Tap a plan to pre-fill it; Cancel
// removes it (server mode: confirm, then DELETE /api/schedules/[id] with the scheduler bearer token,
// so the cron never runs it again; local mode: the device reminder is dropped). Each server run that
// minted a note shows it as a copyable "Claim note" (same reveal/copy pattern as the success screen)
// so the owner can hand it to the recipient; without that string a scheduled deposit is unspendable.
import { useState } from "react";
import { txExplorer } from "@/lib/stellar";
import { short } from "@/lib/zk";
import { Button, useToast } from "@/components/ui";
import { Label, Ext, CAP, TYPED } from "@/components/sender/Label";

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
    <Label className="mt-4" bar="Scheduled sends" right={serverMode ? "runs on-chain daily" : "saved on this device"}>
      <ul className="m-0 list-none divide-y divide-ink/25 p-0">
        {schedules.map((s) => {
          const sc = corridors.find((c) => c.code === s.code);
          const last = s.history && s.history[0];
          return (
            <li key={s.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <button onClick={() => onPrefill(s)} className="min-w-0 flex-1 text-left" title="Tap to pre-fill this plan for a manual send.">
                  <div className="truncate font-mono text-sm font-bold tabular-nums text-ink">
                    ${s.amount} USDC · {sc ? sc.country : s.code}
                  </div>
                  <div className={`mt-0.5 truncate ${TYPED}`}>
                    {s.frequency} · to {s.recipient || "recipient"} · next {fmtDate(s.nextDate)}
                  </div>
                </button>
                <button
                  onClick={() => cancel(s.id)}
                  disabled={cancelingId !== null}
                  aria-label={serverMode ? "Cancel scheduled plan" : "Remove scheduled plan"}
                  className="shrink-0 rounded-stub border border-ink/45 px-2 py-1 font-mono text-[11px] text-ink-2 transition-colors duration-clock ease-clock hover:border-tape hover:text-tape-deep disabled:opacity-60 disabled:hover:border-ink/45 disabled:hover:text-ink-2"
                >
                  {cancelingId === s.id ? "Cancelling…" : serverMode ? "Cancel" : "Remove"}
                </button>
              </div>
              {/* Link lives outside the prefill button: an <a> inside a <button> is invalid markup. */}
              {last && (
                <div className={`mt-1 truncate ${TYPED}`}>
                  {last.depHash ? (
                    <Ext href={txExplorer(last.depHash)} className={last.regOk ? "" : "text-ink-2"}>
                      last run: tx {short(last.depHash)} {last.regOk ? "registered" : "· registering"}
                    </Ext>
                  ) : (
                    <span className="text-tape-deep">last run failed: {last.error || "unknown error"}</span>
                  )}
                </div>
              )}
              {errors[s.id] && <p className="mt-1.5 break-words text-[12px] leading-relaxed text-tape-deep">{errors[s.id]}</p>}
              {last?.note && <ClaimNote note={last.note} at={last.at} />}
            </li>
          );
        })}
      </ul>
      <p className={`mt-3 border-t border-ink/25 pt-2 ${TYPED}`}>
        {serverMode
          ? "Runs daily on-chain: each due plan's deposit and shielded-tree registration execute automatically. Handing the claim note to the recipient (the withdraw leg) stays the next step."
          : "Reminders only. Tap a plan to pre-fill the form, then send it yourself. No money moves automatically."}
      </p>
    </Label>
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
    <div className="mt-2 border-t border-ink/25 pt-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={CAP}>Claim note (bearer)</div>
          <div className={`truncate ${TYPED}`}>from the run on {new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · share only with the recipient</div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="subtle" onClick={() => setShown((v) => !v)}>
            {shown ? "Hide" : "Reveal"}
          </Button>
          <Button variant="ghost" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      {shown && <div className="mt-2 break-all rounded-tile border border-ink/45 bg-input p-2 font-mono text-[10px] leading-relaxed text-ink shadow-inset">{note}</div>}
    </div>
  );
}

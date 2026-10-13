"use client";
// The sender's "Scheduled sends": standing orders on a slip. Tap a plan to pre-fill it and send it
// yourself; Cancel removes it (server mode: confirm, then DELETE /api/schedules/[id] with the
// scheduler bearer token, so no more reminders; local mode: the device reminder is dropped). In
// server mode the owner can turn on due-day push reminders for this browser. Receipts from the
// retired server-executed runs still show their claim note so it can be handed to the recipient.
import { useEffect, useState } from "react";
import { remindersOn, subscribeReminders } from "@/components/sender/reminders";
import { txExplorer } from "@/lib/stellar";
import { short } from "@/lib/zk";
import { Button, useToast } from "@/components/ui";
import { Label, Ext, CAP, TYPED } from "@/components/sender/Label";

// `depHash` = the deposit the owner signed for this run (verified on-chain before it was recorded).
// `skipped` = the reminder was held (rate condition not met, oracle unreadable, spending guard); the
// plan stays due and is re-checked the next day.
export type PlanRun = { at: string; depHash?: string; regOk?: boolean; error?: string; note?: string; skipped?: string; observedRate?: number };
export type PlanCondition = { symbol: string; minRate: number };
export type SchedulePlan = { id: string; amount: string; code: string; recipient: string; frequency: "weekly" | "monthly"; nextDate: string; history?: PlanRun[]; condition?: PlanCondition };

/** The plain promise every plan surface repeats. */
export const SELF_SIGNED = "Tukar never holds a key that can move your money; on the due day you get a reminder and sign the send yourself.";
/** Today as a UTC calendar date, the day plans are due on. */
export const todayUtc = () => new Date().toISOString().slice(0, 10);

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
export const fmtRate = (r: number) => (r >= 100 ? Math.round(r).toLocaleString("en-US") : r.toFixed(2));

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
  const [reminding, setReminding] = useState<"off" | "on" | "busy">("off");
  useEffect(() => setReminding(remindersOn() ? "on" : "off"), []);

  async function turnOnReminders() {
    if (!token) return;
    setReminding("busy");
    const r = await subscribeReminders(token);
    setReminding(r.ok ? "on" : "off");
    toast(r.ok ? "Reminders on. On the due day this browser gets a notification to sign the send." : r.error, r.ok ? "success" : "error");
  }

  async function cancel(id: string) {
    if (!serverMode) {
      onRemoved(id);
      return;
    }
    if (!token) {
      setErrors((e) => ({ ...e, [id]: "Connect a wallet to cancel (it signs you in)." }));
      return;
    }
    if (!window.confirm("Cancel this scheduled send? You will get no more reminders for it.")) return;
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
    <Label className="mt-4" bar="Scheduled sends" right={serverMode ? "reminders, you sign" : "saved on this device"}>
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
                    {s.frequency} · to {s.recipient || "recipient"} · {s.nextDate <= todayUtc() ? "due now" : `next ${fmtDate(s.nextDate)}`} (UTC)
                  </div>
                  {s.condition && (
                    <div className={`mt-0.5 truncate ${TYPED}`}>
                      only when USD to {s.condition.symbol} is at least {fmtRate(s.condition.minRate)}
                      {serverMode ? " (Reflector oracle, checked before each reminder)" : " (saved with the reminder; nothing checks it on this device)"}
                    </div>
                  )}
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
              {/* Links live outside the prefill button: an <a> inside a <button> is invalid markup. */}
              {last && (
                <div className={`mt-1 truncate ${TYPED}`}>
                  {last.skipped ? (
                    <span className="text-ink-2">last run held: {last.skipped}</span>
                  ) : last.depHash ? (
                    <Ext href={txExplorer(last.depHash)}>last run: you signed tx {short(last.depHash)}</Ext>
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
        {SELF_SIGNED} Tap a plan to pre-fill the form{serverMode ? "; once your send lands, the plan is marked done and moves to its next date." : "."}
      </p>
      {serverMode && token && (
        <div className="mt-2">
          {reminding === "on" ? (
            <p className={TYPED}>Due-day reminders are on for this browser.</p>
          ) : (
            <Button variant="subtle" busy={reminding === "busy"} disabled={reminding === "busy"} onClick={turnOnReminders}>
              Remind me on the due day
            </Button>
          )}
        </div>
      )}
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

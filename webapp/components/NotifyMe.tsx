"use client";

// "Notify me" stub: one tap opts a browser in to a real Web Push notification for one note
// (receiver: when it becomes spendable; sender: when it is claimed). States: idle / busy /
// subscribed / denied / unsupported / error. Honest copy: checks run daily plus whenever the
// note's status is checked, and iOS needs a Home Screen install.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { pushSupport, subscribeWatch, unsubscribeWatch, watchId, supportMessage, type WatchKind } from "@/lib/push-client";

type State = "idle" | "busy" | "subscribed" | "denied" | "unsupported" | "error";

type Props = {
  commitment: string;
  kind: WatchKind;
  url: string;
  label: string; // e.g. "Notify me when it is spendable"
  // For kind "spent": derive the nullifier client-side at tap time (needs the leaf index).
  getNullifier?: () => Promise<string>;
  className?: string;
};

const TEXT = "text-[12px] leading-relaxed text-ink-2";

export function NotifyMe({ commitment, kind, url, label, getNullifier, className = "" }: Props) {
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");

  // Reflect an existing watch and the browser's support after mount (no SW registration here).
  useEffect(() => {
    if (watchId(commitment, kind)) setState("subscribed");
    else if (pushSupport() !== "ok") {
      setState("unsupported");
      setMsg(supportMessage(pushSupport()));
    } else if (typeof Notification !== "undefined" && Notification.permission === "denied") setState("denied");
  }, [commitment, kind]);

  async function on() {
    setState("busy");
    setMsg("");
    try {
      const nullifier = kind === "spent" && getNullifier ? await getNullifier() : undefined;
      const r = await subscribeWatch({ kind, commitment, nullifier, url });
      if (r.ok) {
        setState("subscribed");
        setMsg("Watching. You will get a push notification from this browser when it happens.");
      } else {
        setState(r.state);
        setMsg(r.error);
      }
    } catch (e: any) {
      setState("error");
      setMsg((e && e.message) || String(e));
    }
  }

  async function off() {
    setState("busy");
    await unsubscribeWatch(commitment, kind);
    setState("idle");
    setMsg("");
  }

  const busy = state === "busy";
  return (
    <div className={className} data-push-state={state}>
      {state === "subscribed" ? (
        <Button variant="subtle" onClick={off} busy={busy} disabled={busy}>
          Watching, stop notifying me
        </Button>
      ) : (
        <Button variant="subtle" onClick={on} busy={busy} disabled={busy || state === "unsupported"} title={state === "unsupported" ? msg : undefined}>
          {label}
        </Button>
      )}
      {msg && (
        <p className={`mt-1.5 ${TEXT} ${state === "denied" || state === "error" ? "text-tape-deep" : ""}`} role="status" aria-live="polite">
          {msg}
        </p>
      )}
      {state === "idle" && (
        <p className={`mt-1.5 ${TEXT}`}>
          Asks for notification permission. Checked once a day by a scheduled job and each time this note&apos;s status is checked, so it can lag. Only the note&apos;s public identifiers are stored, never the note itself.
        </p>
      )}
    </div>
  );
}

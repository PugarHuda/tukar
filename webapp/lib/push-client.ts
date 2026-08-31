// Browser side of Web Push watches. Nothing here runs on page load: the service worker is
// registered and permission requested only inside subscribeWatch(), i.e. after a tap. The watch
// carries only the commitment (and a client-derived nullifier for "spent"), never the note.
export type WatchKind = "spendable" | "spent";
export type WatchInput = { kind: WatchKind; commitment: string; nullifier?: string; url: string };

const IDS_KEY = "tukar:push:watches"; // { "<commitment>:<kind>": id } so the UI can show "watching"

export type Support = "ok" | "unsupported" | "ios-install" | "insecure";

// Push needs a secure context, a service worker, PushManager and Notification. iOS Safari only
// exposes PushManager to web apps installed on the Home Screen (16.4+), so tell that user why.
export function pushSupport(): Support {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "ok";
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios-install" : "unsupported";
}

export function watchId(commitment: string, kind: WatchKind): string | null {
  try {
    return JSON.parse(localStorage.getItem(IDS_KEY) || "{}")[`${commitment}:${kind}`] || null;
  } catch {
    return null;
  }
}
function setWatchId(commitment: string, kind: WatchKind, id: string | null) {
  try {
    const m = JSON.parse(localStorage.getItem(IDS_KEY) || "{}");
    if (id) m[`${commitment}:${kind}`] = id;
    else delete m[`${commitment}:${kind}`];
    localStorage.setItem(IDS_KEY, JSON.stringify(m));
  } catch {}
}

function b64ToBytes(b64: string): Uint8Array {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export type SubscribeResult = { ok: true; id: string } | { ok: false; state: "denied" | "unsupported" | "error"; error: string };

export async function subscribeWatch(w: WatchInput): Promise<SubscribeResult> {
  const pub = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
  if (!pub) return { ok: false, state: "unsupported", error: "Push is not configured on this deployment." };
  const sup = pushSupport();
  if (sup !== "ok") return { ok: false, state: "unsupported", error: supportMessage(sup) };
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, state: "denied", error: "Notifications are blocked for this site. Allow them in the browser's site settings, then try again." };
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(pub) as BufferSource }));
    const r = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), watch: w }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || typeof j.id !== "string") return { ok: false, state: "error", error: j.error || `Could not save the watch (HTTP ${r.status}).` };
    setWatchId(w.commitment, w.kind, j.id);
    return { ok: true, id: j.id };
  } catch (e: any) {
    return { ok: false, state: "error", error: (e && e.message) || String(e) };
  }
}

export async function unsubscribeWatch(commitment: string, kind: WatchKind): Promise<void> {
  const id = watchId(commitment, kind);
  setWatchId(commitment, kind, null);
  if (!id) return;
  await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
}

export function supportMessage(s: Support): string {
  if (s === "ios-install") return "On iPhone and iPad, add Tukar to the Home Screen first (Share, then Add to Home Screen) and tap Notify me from there. Safari only allows push for installed web apps.";
  if (s === "insecure") return "Push needs an https page.";
  return "This browser does not support Web Push notifications.";
}

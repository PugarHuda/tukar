"use client";
// Due-day reminders for recurring plans: the same service worker + VAPID key as the note watches
// (lib/push-client.ts), but the subscription is stored with the signed-in owner's plans
// (PUT /api/schedules/push) so the daily cron can tell this browser "your send is due". Called only
// from a tap, never on page load.
import { pushSupport, supportMessage, type SubscribeResult } from "@/lib/push-client";

const ON_KEY = "tukar:push:plans"; // "1" once this browser gets plan reminders

export const remindersOn = (): boolean => {
  try {
    return localStorage.getItem(ON_KEY) === "1";
  } catch {
    return false;
  }
};

function b64ToBytes(b64: string): Uint8Array {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function subscribeReminders(token: string): Promise<SubscribeResult> {
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
    const r = await fetch("/api/schedules/push", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return { ok: false, state: "error", error: j.error || `Could not save the reminder (HTTP ${r.status}).` };
    try {
      localStorage.setItem(ON_KEY, "1");
    } catch {}
    return { ok: true, id: "plans" };
  } catch (e: any) {
    return { ok: false, state: "error", error: (e && e.message) || String(e) };
  }
}

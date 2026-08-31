// server-only: Web Push "watches". A browser subscribes (lib/push-client.ts) to be told when a
// note becomes spendable (receiver: the sender's tree registration landed) or spent (sender: the
// receiver claimed it). Each watch lives in Upstash Redis under push:<commitment>:<kind>:<hash of
// the push endpoint> with a 30-day TTL, and holds ONLY public-state identifiers: the commitment and,
// for a "spent" watch, the nullifier the CLIENT derived. Never a bearer note, never a private key.
//
// Delivery is real Web Push (RFC 8030 + VAPID via the `web-push` package) to the browser's push
// service. Checks run from two places: the daily cron (app/api/cron/push, Hobby plans allow daily
// crons only) and opportunistically after any /api/note-status call for the same commitment.
import webpush from "web-push";
import { createHash } from "node:crypto";
import { redis } from "./redis";
import { noteStatus, nullifierSpent } from "./note-status";
import { log, errMsg } from "./log";

export type WatchKind = "spendable" | "spent";
export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type Watch = {
  sub: PushSub;
  kind: WatchKind;
  commitment: string; // decimal field element
  nullifier?: string; // decimal field element, required for kind "spent"
  url: string; // same-origin path the notification opens (/receiver, /sender)
  createdAt: string;
};
// What the chain says right now, in the two bits a watch cares about.
export type ChainState = { knownLeaf: boolean | null; spent: boolean | null };

export const WATCH_TTL_S = 30 * 24 * 3600;
const FIELD = /^\d{1,78}$/;
const KEY_RE = /^push:\d{1,78}:(spendable|spent):[0-9a-f]{16}$/;

export function pushConfigured(): boolean {
  return !!(redis() && process.env.WEB_PUSH_PRIVATE_KEY && process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY);
}

// ---- pure: validation, keys, decisions ---------------------------------------------------------

// Validate an untrusted subscribe body. Returns the Watch or an error string (400 at the route).
export function parseWatch(body: unknown): Watch | string {
  const b = body as any;
  const sub = b?.subscription;
  const w = b?.watch;
  if (typeof sub?.endpoint !== "string" || !/^https:\/\/[^\s]{1,2000}$/.test(sub.endpoint)) return "subscription.endpoint must be an https URL";
  if (typeof sub?.keys?.p256dh !== "string" || typeof sub?.keys?.auth !== "string" || !sub.keys.p256dh || !sub.keys.auth) return "subscription.keys.p256dh and .auth are required";
  if (w?.kind !== "spendable" && w?.kind !== "spent") return 'watch.kind must be "spendable" or "spent"';
  if (!FIELD.test(String(w?.commitment ?? ""))) return "watch.commitment must be a decimal field element";
  if (w.kind === "spent" && !FIELD.test(String(w?.nullifier ?? ""))) return 'watch.nullifier is required for kind "spent"';
  if (w?.nullifier != null && !FIELD.test(String(w.nullifier))) return "watch.nullifier must be a decimal field element";
  // Same-origin path only: notificationclick opens it, so an absolute URL would be an open redirect.
  const url = typeof w?.url === "string" && /^\/[a-z0-9\-/]{0,64}$/i.test(w.url) ? w.url : "/";
  return {
    sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
    kind: w.kind,
    commitment: String(w.commitment),
    ...(w.kind === "spent" ? { nullifier: String(w.nullifier) } : {}),
    url,
    createdAt: new Date().toISOString(),
  };
}

// Deterministic per (commitment, kind, endpoint): re-subscribing overwrites (and refreshes the TTL)
// instead of stacking duplicates, and the id doubles as the unsubscribe handle.
export function watchKey(w: Pick<Watch, "commitment" | "kind"> & { sub: Pick<PushSub, "endpoint"> }): string {
  const h = createHash("sha256").update(w.sub.endpoint).digest("hex").slice(0, 16);
  return `push:${w.commitment}:${w.kind}:${h}`;
}
export const isWatchKey = (id: unknown): id is string => typeof id === "string" && KEY_RE.test(id);

// The notification to send for this chain state, or null when nothing changed yet.
export function evaluate(kind: WatchKind, st: ChainState): { title: string; body: string } | null {
  if (kind === "spendable" && st.knownLeaf === true) {
    return { title: "Your payment is ready", body: "It is registered on-chain and can be withdrawn now. Open Tukar to release it." };
  }
  if (kind === "spent" && st.spent === true) {
    return { title: "Your note was claimed", body: "The receiver spent it on-chain. Nothing is left to refund." };
  }
  return null;
}

// ---- store -------------------------------------------------------------------------------------

export async function saveWatch(w: Watch): Promise<string> {
  const r = redis();
  if (!r) throw new Error("push store not configured");
  const id = watchKey(w);
  await r.set(id, w, { ex: WATCH_TTL_S });
  return id;
}

export async function deleteWatch(id: string): Promise<void> {
  await redis()?.del(id);
}

// Every stored watch matching the pattern (default: all). SCAN, so a big keyspace is paged.
// ponytail: full SCAN per sweep; an index set per commitment if watch counts get large.
export async function listWatches(match = "push:*"): Promise<{ id: string; watch: Watch }[]> {
  const r = redis();
  if (!r) return [];
  const out: { id: string; watch: Watch }[] = [];
  let cursor: string | number = 0;
  do {
    const [next, keys]: [string, string[]] = await r.scan(cursor, { match, count: 100 });
    cursor = next;
    if (keys.length) {
      const vals = await r.mget<(Watch | null)[]>(...keys);
      keys.forEach((id, i) => vals[i] && out.push({ id, watch: vals[i]! }));
    }
  } while (String(cursor) !== "0");
  return out;
}

// ---- send --------------------------------------------------------------------------------------

function vapid() {
  return {
    subject: process.env.WEB_PUSH_SUBJECT || "mailto:hudapugar@gmail.com",
    publicKey: process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || "",
    privateKey: process.env.WEB_PUSH_PRIVATE_KEY || "",
  };
}

export type Outcome = "sent" | "kept" | "dropped" | "failed";

// Send if the state fulfils the watch. Fulfilled + delivered -> the watch is deleted (one-shot).
// 404/410 from the push service = the browser unsubscribed -> drop the watch. Other send errors keep
// it for the next check. Injectable sender so the decision path is unit-testable without a network.
export async function fireWatch(
  id: string,
  w: Watch,
  st: ChainState,
  send: (sub: PushSub, payload: string) => Promise<unknown> = (sub, payload) =>
    webpush.sendNotification(sub, payload, { vapidDetails: vapid(), TTL: 86400 }),
): Promise<Outcome> {
  const n = evaluate(w.kind, st);
  if (!n) return "kept";
  try {
    await send(w.sub, JSON.stringify({ ...n, url: w.url, kind: w.kind }));
    await deleteWatch(id);
    return "sent";
  } catch (e: any) {
    if (e?.statusCode === 404 || e?.statusCode === 410) {
      await deleteWatch(id);
      return "dropped";
    }
    log.warn("web-push send failed", { route: "push", id: id.slice(0, 12), status: e?.statusCode, err: errMsg(e) });
    return "failed";
  }
}

// Read the chain for one watch. A "spent" watch checks its stored nullifier directly (no note
// needed); a "spendable" watch checks leaf membership of the commitment.
export async function chainStateFor(w: Watch): Promise<ChainState> {
  if (w.kind === "spent" && w.nullifier) {
    try {
      return { knownLeaf: null, spent: await nullifierSpent(w.nullifier) };
    } catch {
      return { knownLeaf: null, spent: null };
    }
  }
  const s = await noteStatus({ commitment: w.commitment });
  return { knownLeaf: s.knownLeaf, spent: s.nullifierSpent };
}

// Check every watch matching `match` against the chain. Used by the cron (all) and, with a
// commitment-scoped pattern, by the opportunistic path.
export async function sweepWatches(match = "push:*", state?: ChainState): Promise<Record<Outcome, number> & { watches: number }> {
  const tally: Record<Outcome, number> & { watches: number } = { sent: 0, kept: 0, dropped: 0, failed: 0, watches: 0 };
  if (!pushConfigured()) return tally;
  const all = await listWatches(match);
  tally.watches = all.length;
  for (const { id, watch } of all) {
    const st = state ?? (await chainStateFor(watch));
    tally[await fireWatch(id, watch, st)]++;
  }
  return tally;
}

// Opportunistic path for /api/note-status: the route already read the chain for this commitment,
// so reuse that state for any watches on it instead of a second RPC round-trip.
export async function notifyWatchesFor(commitment: string, st: ChainState): Promise<void> {
  if (!FIELD.test(commitment) || !pushConfigured()) return;
  try {
    const t = await sweepWatches(`push:${commitment}:*`, st);
    if (t.watches) log.info("push watches checked", { route: "note-status", ...t });
  } catch (e) {
    log.warn("push watch check failed", { route: "note-status", err: errMsg(e) });
  }
}

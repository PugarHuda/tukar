// server-only: the alert transport the monitoring plan says is missing (THREAT_MODEL 5.4).
//
// The operator console is pull-based, so nothing reaches anyone unless a human is looking at it.
// This pushes the structural findings from lib/txmon.ts out of the browser over the Web Push that
// is already implemented end to end here (lib/push.ts, public/sw.js, VAPID keys in the env), rather
// than adding a second channel. Fit, honestly:
//   good:    real RFC 8030 delivery, arrives with the tab closed, no new dependency or account,
//            no secret beyond the VAPID key already present, and public/sw.js is already generic
//            over the payload so it needed no change.
//   ceiling: cadence. Vercel Hobby allows two daily crons and both are taken, so this sweep rides
//            the existing /api/cron/push run instead of getting its own schedule. That makes it a
//            daily digest, not a pager. A Critical row in 5.3 that says "page" still means a
//            minute-scale schedule, which is a plan change (Pro crons or an external scheduler),
//            not a code change. Stated here rather than implied by the word "alert".
//
// Subscriptions live under opalert:sub:<hash of the endpoint>, and the finding ids already sent to
// one live under opalert:seen:<same hash>, so a standing finding is announced once per operator
// rather than every sweep, and a browser that subscribes today still gets what is currently wrong
// instead of silence until the next new thing happens.
import { createHash } from "node:crypto";
import { redis } from "./redis";
import { pushConfigured, sendPush, type PushSub } from "./push";
import { readTxMonitoring, evaluate, unseen, alertPayload, type Finding } from "./txmon";
import { readMonitoringWindow, adminEvents } from "./anomaly";
import { SOURCE } from "./constants";
import { log, errMsg } from "./log";

const SUB_TTL_S = 30 * 24 * 3600;
const SEEN_TTL_S = 30 * 24 * 3600;
const SUB_RE = /^opalert:sub:[0-9a-f]{16}$/;

const hash16 = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
export const subKey = (endpoint: string): string => `opalert:sub:${hash16(endpoint)}`;
export const seenKey = (subId: string): string => subId.replace("opalert:sub:", "opalert:seen:");
export const isSubKey = (id: unknown): id is string => typeof id === "string" && SUB_RE.test(id);

/** Validate an untrusted subscribe body. Returns the subscription or an error string (400). */
export function parseSub(body: unknown): PushSub | string {
  const sub = (body as { subscription?: PushSub })?.subscription;
  if (typeof sub?.endpoint !== "string" || !/^https:\/\/[^\s]{1,2000}$/.test(sub.endpoint)) return "subscription.endpoint must be an https URL";
  if (typeof sub?.keys?.p256dh !== "string" || typeof sub?.keys?.auth !== "string" || !sub.keys.p256dh || !sub.keys.auth) return "subscription.keys.p256dh and .auth are required";
  return { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
}

export const alertsConfigured = (): boolean => pushConfigured();

export async function saveSub(sub: PushSub): Promise<string> {
  const r = redis();
  if (!r) throw new Error("alert store not configured");
  const id = subKey(sub.endpoint);
  await r.set(id, { sub, createdAt: new Date().toISOString() }, { ex: SUB_TTL_S });
  return id;
}

export async function deleteSub(id: string): Promise<void> {
  await redis()?.del(id, seenKey(id));
}

/** Every operator subscription. ponytail: SCAN per sweep; a set index if operators ever number more than a desk. */
export async function listSubs(): Promise<{ id: string; sub: PushSub }[]> {
  const r = redis();
  if (!r) return [];
  const out: { id: string; sub: PushSub }[] = [];
  let cursor: string | number = 0;
  do {
    const [next, keys]: [string, string[]] = await r.scan(cursor, { match: "opalert:sub:*", count: 100 });
    cursor = next;
    if (keys.length) {
      const vals = await r.mget<({ sub: PushSub } | null)[]>(...keys);
      keys.forEach((id, i) => vals[i]?.sub && out.push({ id, sub: vals[i]!.sub }));
    }
  } while (String(cursor) !== "0");
  return out;
}

/** Read both windows and run the rules. Exported so the console and the sweep see one answer. */
export async function collectFindings(): Promise<Finding[]> {
  const [tx, events] = await Promise.all([readTxMonitoring(), readMonitoringWindow().catch(() => null)]);
  return evaluate({
    records: tx.records,
    adminAccount: SOURCE,
    adminEvents: events ? adminEvents(events.events) : [],
    windowTruncated: events?.truncated ?? false,
  });
}

export type SweepResult = { configured: boolean; subscribers: number; findings: number; newFindings: number; sent: number; dropped: number; failed: number };

/**
 * Check the corridor and push every alert-worthy finding that has not been announced before.
 * 404/410 from the push service means the browser unsubscribed, so that subscription is dropped.
 */
export async function sweepOperatorAlerts(send: (sub: PushSub, payload: string) => Promise<unknown> = sendPush): Promise<SweepResult> {
  const out: SweepResult = { configured: alertsConfigured(), subscribers: 0, findings: 0, newFindings: 0, sent: 0, dropped: 0, failed: 0 };
  const r = redis();
  if (!out.configured || !r) return out;
  const subs = await listSubs();
  out.subscribers = subs.length;
  const findings = await collectFindings();
  out.findings = findings.length;
  for (const { id, sub } of subs) {
    const key = seenKey(id);
    const seen = await r.smembers<string[]>(key).catch(() => [] as string[]);
    const fresh = unseen(findings, seen ?? []);
    out.newFindings = Math.max(out.newFindings, fresh.length);
    const announced: string[] = [];
    let gone = false;
    for (const f of fresh) {
      try {
        await send(sub, JSON.stringify(alertPayload(f)));
        announced.push(f.id);
        out.sent++;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await deleteSub(id);
          await r.del(key);
          out.dropped++;
          gone = true;
          break; // the browser unsubscribed; the rest of the findings have nowhere to go
        }
        out.failed++;
        log.warn("operator alert send failed", { route: "op-alerts", id: id.slice(0, 24), status, err: errMsg(e) });
      }
    }
    // Only what actually left is recorded, so a send that failed is retried on the next sweep.
    if (!gone && announced.length) {
      const [first, ...rest] = announced;
      await r.sadd(key, first, ...rest);
      await r.expire(key, SEEN_TTL_S);
    }
  }
  return out;
}

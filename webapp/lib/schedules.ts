import "server-only";
// Store for recurring send plans, scoped PER OWNER and PRIVATE. Two backends, picked at runtime:
//   - Vercel Blob (BLOB_READ_WRITE_TOKEN set): one private blob per owner at schedules/<owner>.json,
//     read server-side with the store token (access:"private", no public URL).
//   - Upstash Redis (no Blob token, KV_REST_API_URL + KV_REST_API_TOKEN or the portable
//     UPSTASH_REDIS_REST_URL/_TOKEN set, the same env lib/lock.ts and lib/ratelimit.ts use): one key
//     per owner, schedules:<owner>, plus the set schedules:owners the cron sweeps.
// Blob wins when both are set. Both hold the same JSON text, so parsing is shared. The file is an
// OwnerFile: the owner's plans plus their self-set spending guard. Per plan we store metadata and
// per-run receipts (depHash / regOk / error, or a `skipped` reason when the run held the plan) plus,
// per run that deposited, the encoded bearer note the cron minted, because without it the scheduled
// deposit could never be claimed. The file is owner-private and server-only; the owner's wallet key
// is never stored.
//
// A read distinguishes three outcomes: no file yet (head() 404 -> empty file), a valid file, and a
// corrupt file (logged + thrown as CorruptScheduleFile, never silently treated as empty, so a later
// write cannot clobber whatever is in there). Files written before the guard existed are a bare
// plan array; they parse as { plans, guard: {} }.
import { BlobNotFoundError, get, head, list, put } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import { log, errMsg } from "./log";
import { parseGuard, type SpendingGuard, type Spend } from "./spending-guard";

export type Frequency = "weekly" | "monthly";
// `note` is the encoded bearer note the cron minted for that run: it is what the owner hands to
// the recipient to claim the scheduled deposit, so it is stored with the receipt (the owner's
// file is private, server-only). Older receipts have no note. `skipped` marks a run that held the
// plan without moving money (rate condition not met, oracle unreadable, spending guard); the plan
// stays due and is re-checked by the next daily run. `observedRate` is the oracle rate seen then.
// `pullHash` is the USDC SAC transfer_from that pulled the plan amount from the owner's wallet into
// the relayer under the owner's allowance; `refundHash` the transfer back when the deposit then failed.
export type RunReceipt = { at: string; depHash?: string; regOk?: boolean; error?: string; note?: string; skipped?: string; observedRate?: number; pullHash?: string; refundHash?: string };
// The USDC SAC approve(from=owner, spender=relayer, ...) the owner's wallet signed when the plan was
// created. `amount` is the allowance in USDC read back on-chain at creation; the cron re-reads the
// live allowance before every run, so this is the receipt, not the authority.
export type Approval = { hash: string; spender: string; amount: string; expirationLedger: number };
// `condition`: send only when the Reflector USD->`symbol` rate is at least `minRate`. Only
// corridors with an on-chain oracle feed can carry one (the POST route checks the corridor).
export type StoredSchedule = {
  id: string;
  amount: string;
  code: string;
  recipient: string;
  frequency: Frequency;
  nextDate: string; // YYYY-MM-DD
  history: RunReceipt[];
  condition?: { symbol: string; minRate: number };
  approval?: Approval;
};
export type OwnerFile = { plans: StoredSchedule[]; guard: SpendingGuard };

const PREFIX = "schedules/";
const G_RE = /^G[A-Z2-7]{55}$/;
const AMOUNT_RE = /^\d+(\.\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ownerPath = (owner: string): string => {
  if (!G_RE.test(owner)) throw new Error("invalid owner"); // defense in depth: no path traversal
  return `${PREFIX}${owner}.json`;
};

/** Thrown when an owner's schedule file exists but is not a valid plan list. */
export class CorruptScheduleFile extends Error {
  constructor(reason: string) {
    super(`schedule file is corrupt: ${reason}`);
    this.name = "CorruptScheduleFile";
  }
}

const OWNERS_KEY = "schedules:owners";
const redisKey = (owner: string): string => {
  if (!G_RE.test(owner)) throw new Error("invalid owner");
  return `schedules:${owner}`;
};

function upstashEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
let _redis: Redis | null = null;
function redis(): Redis {
  const env = upstashEnv();
  if (!env) throw new Error("upstash redis is not configured");
  // Raw strings in, raw strings out: parseOwnerFile does the (validating) JSON parse itself.
  if (!_redis) _redis = new Redis({ url: env.url, token: env.token, automaticDeserialization: false });
  return _redis;
}

/** Which store backs the plans: Blob when its token is set, else Redis, else none. */
export function backend(): "blob" | "redis" | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (upstashEnv()) return "redis";
  return null;
}
/** The env a plan store needs, named exactly, for the UI to show when none is wired. */
export const STORAGE_ENV_HINT = "KV_REST_API_URL + KV_REST_API_TOKEN (Upstash Redis) or BLOB_READ_WRITE_TOKEN (Vercel Blob)";

/** True iff a plan store is wired. The UI degrades to the device-local reminder when this is
 *  false, so the build and demo work without it. */
export function isConfigured(): boolean {
  return backend() !== null;
}
function assertConfigured(): void {
  if (!isConfigured()) {
    throw new Error(`scheduled remittances are not configured (set ${STORAGE_ENV_HINT})`);
  }
}

/** Next run date for a frequency as a UTC calendar date (YYYY-MM-DD), the same day the cron and its
 *  lock key use. Monthly clamps to the target month's length (Jan 31 -> Feb 28, not Mar 3); the
 *  sender's preview (app/sender/page.tsx) mirrors this. */
export function computeNextDate(freq: Frequency, from = new Date()): string {
  const d = new Date(from);
  if (freq === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  }
  return d.toISOString().slice(0, 10);
}

// Why a value is not a StoredSchedule, or null when it is. `history` may be absent in the raw
// file (older writes) and is normalised to [] by parseOwnerFile.
function invalidPlan(p: any): string | null {
  if (!p || typeof p !== "object") return "not an object";
  if (typeof p.id !== "string" || !p.id) return "id";
  if (typeof p.amount !== "string" || !AMOUNT_RE.test(p.amount)) return "amount";
  if (typeof p.code !== "string" || !p.code) return "code";
  if (typeof p.recipient !== "string") return "recipient";
  if (p.frequency !== "weekly" && p.frequency !== "monthly") return "frequency";
  if (typeof p.nextDate !== "string" || !DATE_RE.test(p.nextDate) || isNaN(Date.parse(p.nextDate))) return "nextDate";
  if (p.history !== undefined && !Array.isArray(p.history)) return "history";
  if (p.condition !== undefined) {
    const c = p.condition;
    if (!c || typeof c !== "object" || !/^[A-Z]{3}$/.test(String(c.symbol)) || typeof c.minRate !== "number" || !(c.minRate > 0) || !Number.isFinite(c.minRate)) return "condition";
  }
  if (p.approval !== undefined) {
    const a = p.approval;
    if (!a || typeof a !== "object" || !/^[0-9a-f]{64}$/.test(String(a.hash)) || !G_RE.test(String(a.spender)) || typeof a.amount !== "string" || !AMOUNT_RE.test(a.amount) || !Number.isInteger(a.expirationLedger)) return "approval";
  }
  return null;
}

/** Parse + validate the JSON text of an owner file (envelope or legacy bare plan array). Throws
 *  CorruptScheduleFile on any defect. */
export function parseOwnerFile(text: string): OwnerFile {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new CorruptScheduleFile("not JSON");
  }
  const raw = Array.isArray(data) ? { plans: data, guard: {} } : data;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.plans)) throw new CorruptScheduleFile("not a plan list");
  const guard = parseGuard(raw.guard);
  if (!guard) throw new CorruptScheduleFile("bad guard");
  const plans = raw.plans.map((p: any, i: number) => {
    const why = invalidPlan(p);
    if (why) throw new CorruptScheduleFile(`plan ${i}: bad ${why}`);
    return { ...p, history: p.history ?? [] } as StoredSchedule;
  });
  return { plans, guard };
}

// Shared tail of both backends: the text must parse, and a corrupt file is logged and thrown.
function parseOrLog(owner: string, text: string): OwnerFile {
  try {
    return parseOwnerFile(text);
  } catch (e) {
    log.error("schedule file corrupt", { owner, err: errMsg(e) });
    throw e;
  }
}

export async function readOwnerFile(owner: string): Promise<OwnerFile> {
  assertConfigured();
  if (backend() === "redis") {
    const text = await redis().get<string>(redisKey(owner));
    return text == null ? { plans: [], guard: {} } : parseOrLog(owner, text);
  }
  const path = ownerPath(owner);
  // head() first: a missing file is a clean "no plans yet", anything after this is a real read.
  try {
    await head(path);
  } catch (e) {
    if (e instanceof BlobNotFoundError) return { plans: [], guard: {} };
    throw e;
  }
  // useCache:false so a write is immediately visible to the next read (the cron mutates + rereads).
  const res = await get(path, { access: "private", useCache: false });
  if (!res) return { plans: [], guard: {} }; // deleted between head() and get(); the same as never existing
  if (res.statusCode !== 200) throw new Error(`blob read returned ${res.statusCode}`);
  return parseOrLog(owner, await new Response(res.stream).text());
}

export async function readSchedules(owner: string): Promise<StoredSchedule[]> {
  return (await readOwnerFile(owner)).plans;
}

export async function writeOwnerFile(owner: string, file: OwnerFile): Promise<void> {
  assertConfigured();
  if (backend() === "redis") {
    // One MULTI: the file and the owner's membership in the cron's sweep set land together.
    await redis().multi().set(redisKey(owner), JSON.stringify(file)).sadd(OWNERS_KEY, owner).exec();
    return;
  }
  await put(ownerPath(owner), JSON.stringify(file), {
    access: "private", // no public URL; readable only server-side with the store token
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}

/** Remove one of `owner`'s plans. Returns false when no plan has that id. Read-modify-write on the
 *  owner's file, so a corrupt file throws here too rather than being replaced. */
export async function deleteSchedule(owner: string, id: string): Promise<boolean> {
  const file = await readOwnerFile(owner);
  const next = file.plans.filter((s) => s.id !== id);
  if (next.length === file.plans.length) return false;
  await writeOwnerFile(owner, { ...file, plans: next });
  return true;
}

/** What the scheduler has actually deposited for this owner: one Spend per run receipt that
 *  carries a deposit hash, at the plan's amount. This is the cron's source of truth for the
 *  owner's spending guard (the relayer's own sends, not the owner's browser sends). */
export function spendsFromPlans(plans: StoredSchedule[]): Spend[] {
  const out: Spend[] = [];
  for (const p of plans) for (const r of p.history) if (r.depHash) out.push({ at: r.at, usdc: Number(p.amount) });
  return out;
}

/** All owner addresses that have a schedule file. Used by the cron to sweep due plans. */
export async function listAllOwners(): Promise<string[]> {
  assertConfigured();
  if (backend() === "redis") {
    // A set, not a SCAN: every write adds its owner, so the sweep is one SMEMBERS.
    const members = await redis().smembers(OWNERS_KEY);
    return members.filter((m) => G_RE.test(m));
  }
  // Follows the cursor to the end. `list` returns at most 1000 blobs per page, and a single page
  // would silently drop every owner past the cut: their due plans would never be swept and their
  // scheduled sends would simply stop, with no error anywhere. Paging is the difference between
  // "slow at scale" and "quietly skips people's money", so it is not optional.
  const owners: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: PREFIX, cursor });
    for (const b of page.blobs) {
      const m = b.pathname.match(/^schedules\/(G[A-Z2-7]{55})\.json$/);
      if (m) owners.push(m[1]);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return owners;
}

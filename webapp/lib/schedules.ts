import "server-only";
// Vercel Blob-backed store for recurring send plans, scoped PER OWNER and PRIVATE.
// Each authenticated owner (Stellar G-address) gets its own private blob at schedules/<owner>.json,
// read server-side with the store token (access:"private", no public URL). The file is an
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
import { log, errMsg } from "./log";
import { parseGuard, type SpendingGuard, type Spend } from "./spending-guard";

export type Frequency = "weekly" | "monthly";
// `note` is the encoded bearer note the cron minted for that run: it is what the owner hands to
// the recipient to claim the scheduled deposit, so it is stored with the receipt (the owner's
// file is private, server-only). Older receipts have no note. `skipped` marks a run that held the
// plan without moving money (rate condition not met, oracle unreadable, spending guard); the plan
// stays due and is re-checked by the next daily run. `observedRate` is the oracle rate seen then.
export type RunReceipt = { at: string; depHash?: string; regOk?: boolean; error?: string; note?: string; skipped?: string; observedRate?: number };
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

/** True iff Blob storage is wired (BLOB_READ_WRITE_TOKEN present). The UI degrades to the
 *  device-local reminder when this is false, so the build and demo work without the token. */
export function isConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}
function assertConfigured(): void {
  if (!isConfigured()) {
    throw new Error("scheduled remittances are not configured (set BLOB_READ_WRITE_TOKEN)");
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

export async function readOwnerFile(owner: string): Promise<OwnerFile> {
  assertConfigured();
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
  try {
    return parseOwnerFile(await new Response(res.stream).text());
  } catch (e) {
    log.error("schedule file corrupt", { owner, err: errMsg(e) });
    throw e;
  }
}

export async function readSchedules(owner: string): Promise<StoredSchedule[]> {
  return (await readOwnerFile(owner)).plans;
}

export async function writeOwnerFile(owner: string, file: OwnerFile): Promise<void> {
  assertConfigured();
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
  // ponytail: single list page (default 1000). Add cursor paging if owners ever exceed that.
  const { blobs } = await list({ prefix: PREFIX });
  const owners: string[] = [];
  for (const b of blobs) {
    const m = b.pathname.match(/^schedules\/(G[A-Z2-7]{55})\.json$/);
    if (m) owners.push(m[1]);
  }
  return owners;
}

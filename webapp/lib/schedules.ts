import "server-only";
// Vercel Blob-backed store for recurring send plans, scoped PER OWNER and PRIVATE.
// Each authenticated owner (Stellar G-address) gets its own private blob at schedules/<owner>.json,
// read server-side with the store token (access:"private", no public URL). We store plan
// metadata and per-run receipts (depHash / regOk / error) plus, per run, the encoded bearer note
// the cron minted, because without it the scheduled deposit could never be claimed. The file is
// owner-private and server-only; the owner's wallet key is never stored.
//
// A read distinguishes three outcomes: no file yet (head() 404 -> []), a valid file (its plans),
// and a corrupt file (logged + thrown as CorruptScheduleFile, never silently treated as empty, so
// a later write cannot clobber whatever is in there).
import { BlobNotFoundError, get, head, list, put } from "@vercel/blob";
import { log, errMsg } from "./log";

export type Frequency = "weekly" | "monthly";
// `note` is the encoded bearer note the cron minted for that run: it is what the owner hands to
// the recipient to claim the scheduled deposit, so it is stored with the receipt (the owner's
// file is private, server-only). Older receipts have no note.
export type RunReceipt = { at: string; depHash?: string; regOk?: boolean; error?: string; note?: string };
export type StoredSchedule = {
  id: string;
  amount: string;
  code: string;
  recipient: string;
  frequency: Frequency;
  nextDate: string; // YYYY-MM-DD
  history: RunReceipt[];
};

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

/** Next run date from now for a frequency. Local-date (YYYY-MM-DD), matches the sender's preview. */
export function computeNextDate(freq: Frequency): string {
  const d = new Date();
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// Why a value is not a StoredSchedule, or null when it is. `history` may be absent in the raw
// file (older writes) and is normalised to [] by parseSchedules.
function invalidPlan(p: any): string | null {
  if (!p || typeof p !== "object") return "not an object";
  if (typeof p.id !== "string" || !p.id) return "id";
  if (typeof p.amount !== "string" || !AMOUNT_RE.test(p.amount)) return "amount";
  if (typeof p.code !== "string" || !p.code) return "code";
  if (typeof p.recipient !== "string") return "recipient";
  if (p.frequency !== "weekly" && p.frequency !== "monthly") return "frequency";
  if (typeof p.nextDate !== "string" || !DATE_RE.test(p.nextDate) || isNaN(Date.parse(p.nextDate))) return "nextDate";
  if (p.history !== undefined && !Array.isArray(p.history)) return "history";
  return null;
}

/** Parse + validate the JSON text of a schedule file. Throws CorruptScheduleFile on any defect. */
export function parseSchedules(text: string): StoredSchedule[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new CorruptScheduleFile("not JSON");
  }
  if (!Array.isArray(data)) throw new CorruptScheduleFile("not an array");
  return data.map((p, i) => {
    const why = invalidPlan(p);
    if (why) throw new CorruptScheduleFile(`plan ${i}: bad ${why}`);
    return { ...p, history: p.history ?? [] } as StoredSchedule;
  });
}

export async function readSchedules(owner: string): Promise<StoredSchedule[]> {
  assertConfigured();
  const path = ownerPath(owner);
  // head() first: a missing file is a clean "no plans yet", anything after this is a real read.
  try {
    await head(path);
  } catch (e) {
    if (e instanceof BlobNotFoundError) return [];
    throw e;
  }
  // useCache:false so a write is immediately visible to the next read (the cron mutates + rereads).
  const res = await get(path, { access: "private", useCache: false });
  if (!res) return []; // deleted between head() and get(); the same as never existing
  if (res.statusCode !== 200) throw new Error(`blob read returned ${res.statusCode}`);
  try {
    return parseSchedules(await new Response(res.stream).text());
  } catch (e) {
    log.error("schedule file corrupt", { owner, err: errMsg(e) });
    throw e;
  }
}

export async function writeSchedules(owner: string, next: StoredSchedule[]): Promise<void> {
  assertConfigured();
  await put(ownerPath(owner), JSON.stringify(next), {
    access: "private", // no public URL; readable only server-side with the store token
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}

/** Remove one of `owner`'s plans. Returns false when no plan has that id. Read-modify-write on the
 *  owner's file, so a corrupt file throws here too rather than being replaced. */
export async function deleteSchedule(owner: string, id: string): Promise<boolean> {
  const current = await readSchedules(owner);
  const next = current.filter((s) => s.id !== id);
  if (next.length === current.length) return false;
  await writeSchedules(owner, next);
  return true;
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

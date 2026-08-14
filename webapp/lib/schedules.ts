import "server-only";
// Vercel Blob-backed store for recurring send plans, scoped PER OWNER and PRIVATE.
// Each authenticated owner (Stellar G-address) gets its own private blob at schedules/<owner>.json,
// read server-side with the store token (access:"private", no public URL). We store ONLY plan
// metadata and per-run receipts (depHash / regOk / error) — never a bearer note, private key,
// blinding, or any secret. A schedule executes by MINTING a fresh note in the cron run.
import { get, list, put } from "@vercel/blob";

export type Frequency = "weekly" | "monthly";
export type RunReceipt = { at: string; depHash?: string; regOk?: boolean; error?: string };
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
const ownerPath = (owner: string): string => {
  if (!G_RE.test(owner)) throw new Error("invalid owner"); // defense in depth: no path traversal
  return `${PREFIX}${owner}.json`;
};

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

export async function readSchedules(owner: string): Promise<StoredSchedule[]> {
  assertConfigured();
  // useCache:false so a write is immediately visible to the next read (the cron mutates + rereads).
  const res = await get(ownerPath(owner), { access: "private", useCache: false });
  if (!res || res.statusCode !== 200) return [];
  const data = JSON.parse(await new Response(res.stream).text());
  return Array.isArray(data) ? (data as StoredSchedule[]) : [];
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

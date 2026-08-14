import "server-only";
// Vercel Blob-backed store for recurring send plans. ONE public JSON blob (schedules.json).
// SECURITY: the blob is PUBLIC and world-readable. We store ONLY plan metadata and per-run
// receipts (depHash / regOk / error) — never a bearer note, private key, blinding, or any
// secret. A schedule executes by MINTING a fresh note in the cron run; the note never lands here.
import { list, put } from "@vercel/blob";

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

const BLOB_PATH = "schedules.json";

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

export async function readSchedules(): Promise<StoredSchedule[]> {
  assertConfigured();
  const { blobs } = await list({ prefix: BLOB_PATH });
  const found = blobs.find((b) => b.pathname === BLOB_PATH);
  if (!found) return [];
  const res = await fetch(found.url, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? (data as StoredSchedule[]) : [];
}

export async function writeSchedules(next: StoredSchedule[]): Promise<void> {
  assertConfigured();
  // Fixed pathname (no random suffix) + overwrite so schedules.json is a single mutable doc.
  await put(BLOB_PATH, JSON.stringify(next), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
  });
}

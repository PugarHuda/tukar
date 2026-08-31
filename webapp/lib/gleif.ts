// GLEIF Legal Entity Identifier lookups over the free, keyless GLEIF API (JSON:API, CORS *), so
// the Travel Rule payload can carry a REAL originating-VASP identifier instead of a placeholder.
// Isomorphic: the regulator tab resolves a typed LEI live in the browser; the send route
// validates the same format server-side. Never fabricates: an unknown LEI is an honest null.
import { fetchWithTimeout } from "./net";

export const GLEIF_API = "https://api.gleif.org/api/v1/lei-records";

export type LeiRecord = {
  lei: string;
  legalName: string;
  country: string; // ISO 3166-1 alpha-2 of the legal address
  jurisdiction: string;
  status: string; // ACTIVE | INACTIVE | ...
};

// ISO 17442: 20 chars, [A-Z0-9]{18} + two numeric ISO 7064 MOD 97-10 check digits. Letters map
// to 10..35 (A=10) and the resulting decimal string mod 97 must equal 1 (same scheme as IBAN).
export function isValidLei(s: string): boolean {
  if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(s)) return false;
  let r = 0;
  for (const ch of s) {
    const v = ch >= "A" ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    // Feed each digit of the (one- or two-digit) value separately to keep the running remainder small.
    for (const d of String(v)) r = (r * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return r === 1;
}

// 24h in-memory cache keyed by the query. LEI records change rarely (GLEIF publishes a daily
// golden copy) and the API is rate-limited (60 req/min), so repeated form edits must not refetch.
// ponytail: per-instance Map, fine for a browser tab or a warm function; no eviction beyond TTL.
const TTL_MS = 24 * 3600 * 1000;
const cache = new Map<string, { at: number; v: LeiRecord[] }>();

function toRecord(row: any): LeiRecord {
  const a = row?.attributes ?? {};
  const e = a.entity ?? {};
  return {
    lei: String(a.lei ?? row?.id ?? ""),
    legalName: String(e.legalName?.name ?? ""),
    country: String(e.legalAddress?.country ?? ""),
    jurisdiction: String(e.jurisdiction ?? ""),
    status: String(e.status ?? ""),
  };
}

async function query(params: Record<string, string>): Promise<LeiRecord[]> {
  const key = new URLSearchParams(params).toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  const res = await fetchWithTimeout(`${GLEIF_API}?${key}`, { headers: { accept: "application/vnd.api+json" } }, 10_000);
  if (!res.ok) throw new Error(`GLEIF API answered HTTP ${res.status}`);
  const body = await res.json();
  const rows = Array.isArray(body?.data) ? body.data.map(toRecord).filter((r: LeiRecord) => r.lei) : [];
  cache.set(key, { at: Date.now(), v: rows });
  return rows;
}

/** One record for an exact LEI, or null when GLEIF has no such LEI. Throws only when GLEIF is unreachable. */
export async function lookupLei(lei: string): Promise<LeiRecord | null> {
  const id = lei.trim().toUpperCase();
  if (!isValidLei(id)) return null;
  const rows = await query({ "filter[lei]": id });
  return rows.find((r) => r.lei === id) ?? null;
}

/** Records whose legal name matches (GLEIF's own fuzzy match), most relevant first; [] when none. */
export async function searchLeiByName(name: string, limit = 5): Promise<LeiRecord[]> {
  const q = name.trim();
  if (q.length < 3) return [];
  return query({ "filter[entity.legalName]": q, "page[size]": String(limit) });
}

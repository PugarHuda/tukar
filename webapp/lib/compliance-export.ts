// Tukar — compliance export pack for the Regulator console. Builds a jurisdiction-shaped report
// from what the console already has: decoded pool events (RPC getEvents), the disclosures it
// verified this session, the audit requests it registered, and the live policy snapshot. Three
// presets: PPATK LTKL (Indonesia), EU TFR, BSP PHP 50,000 threshold (Philippines). Tukar holds no
// PII, so every identity field is exported as the literal "anchor-held" and the header says so.
// buildReport / toCsv / toJson are pure; readPoolEvents and fetchPhpRate do the I/O.
import * as Sdk from "@stellar/stellar-sdk";
import { server } from "./soroban/rpc";
import { POOL, PASSPHRASE } from "./constants";
import { fmtUsdc, type DisclosureType, type AuditReceipt, type ReceiptVerification } from "./zk";
import { CORRIDORS } from "../components/receiver/corridors";

export const ANCHOR_HELD = "anchor-held";
export const RPC_RETENTION_NOTE = "Stellar RPC retains roughly 7 days of events; the from/to ledger times are those of the earliest and latest events in this export.";

// ---- on-chain pool events, decoded ----
export type PoolEvent = {
  kind: string; // deposit | withdraw | transfer | root
  ledger: number;
  closedAt: string; // ISO, from the RPC ledgerClosedAt
  txHash: string;
  amountStroops?: string; // deposit / withdraw carry a public amount
  commitment?: string; // deposit
  recipient?: string; // withdraw (Stellar address)
};
export type PoolEventWindow = { events: PoolEvent[]; oldestLedger: number; latestLedger: number };

const bytesToDec = (b: any): string => {
  const u = b instanceof Uint8Array ? b : Uint8Array.from(b);
  let n = 0n;
  for (const x of u) n = (n << 8n) | BigInt(x);
  return n.toString();
};
const native = (x: any): any => {
  try {
    return Sdk.scValToNative(typeof x === "string" ? Sdk.xdr.ScVal.fromXDR(x, "base64") : x);
  } catch {
    return null;
  }
};
// Event shapes are fixed by contracts/pool/src/lib.rs:
//   (deposit, index) -> (commitment, amount) · (withdraw, recipient) -> amount
//   (transfer) -> root · (root, new_leaf) -> new_root
export function decodePoolEvent(ev: { topic?: any[]; value?: any; ledger: number; ledgerClosedAt: string; txHash: string }): PoolEvent {
  const kind = String(native(ev.topic?.[0]) ?? "?");
  const out: PoolEvent = { kind, ledger: ev.ledger, closedAt: ev.ledgerClosedAt, txHash: ev.txHash };
  const val = native(ev.value);
  if (kind === "deposit" && Array.isArray(val) && val.length >= 2) {
    out.commitment = bytesToDec(val[0]);
    out.amountStroops = String(val[1]);
  } else if (kind === "withdraw" && val != null) {
    out.amountStroops = String(val);
    const r = native(ev.topic?.[1]);
    if (typeof r === "string") out.recipient = r;
  }
  return out;
}

/** Every pool event the RPC still retains (oldest first), paged through getEvents. */
export async function readPoolEvents(): Promise<PoolEventWindow> {
  const health = await server.getHealth();
  const filters = [{ type: "contract" as const, contractIds: [POOL] }];
  const LIMIT = 200;
  const events: PoolEvent[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await server.getEvents(cursor ? { filters, cursor, limit: LIMIT } : { filters, startLedger: Math.max(1, health.oldestLedger), limit: LIMIT });
    for (const ev of res.events || []) events.push(decodePoolEvent(ev));
    if (!res.events || res.events.length < LIMIT || !res.cursor) break;
    cursor = res.cursor;
  }
  events.sort((a, b) => a.ledger - b.ledger);
  return { events, oldestLedger: health.oldestLedger, latestLedger: health.latestLedger };
}

// ---- session records the console holds in page state ----
export type DisclosureRecord = {
  type: DisclosureType;
  commitment: string;
  summary: string; // derived from publicSignals by lib/zk.verifyReceipt
  verifiedAt: string;
  verifier: string;
  auditContextHash: string;
  disclosedUsdc?: string; // exact type only
  anchorTx?: string;
  corridor?: string; // corridor code when the disclosure came from a view-only note
};
export type AuditRequestRecord = { issuedHash: string; commitments: string[]; capStroops: string; txHash?: string; registeredAt: string };
export type PolicySnapshot = { aspRoot: string | null; denyList: string[] | null; readAt: string };
export type PhpRate = { phpPerUsd: number; source: string; fetchedAt: string };

/** Map a verified receipt (plus its verification) to the export record. Figures come from publicSignals. */
export function disclosureFromReceipt(res: ReceiptVerification, r: AuditReceipt, corridor?: string): DisclosureRecord {
  const sigs = r.publicSignals.map(String);
  const ctxIdx = res.type === "range" ? 3 : res.type === "aggregate" ? 11 : 2;
  const d: DisclosureRecord = {
    type: res.type,
    commitment: res.commitment,
    summary: res.summary,
    verifiedAt: new Date().toISOString(),
    verifier: r.verifier,
    auditContextHash: sigs[ctxIdx] ?? "",
  };
  if (res.type === "exact") d.disclosedUsdc = fmtUsdc(sigs[1]);
  if (r.anchor?.txHash) d.anchorTx = r.anchor.txHash;
  if (corridor) d.corridor = corridor;
  return d;
}

// ---- presets ----
export type PresetId = "ppatk-ltkl" | "eu-tfr" | "bsp-php-50k";
type RowKey =
  | "recordType" | "date" | "ledger" | "txHash" | "direction" | "amountUsdc" | "currency" | "corridorCountry"
  | "originatorId" | "originatorAccount" | "beneficiaryId" | "beneficiaryAccount" | "originatingVasp" | "beneficiaryVasp"
  | "reference" | "disclosure" | "travelRuleRef" | "amountPhp" | "phpRate" | "thresholdTest" | "notes";
export type ReportRow = Record<RowKey, string>;
export type Preset = { id: PresetId; label: string; jurisdiction: string; regulation: string; reference: string; columns: { key: RowKey; label: string }[] };

export const PRESETS: Preset[] = [
  {
    id: "ppatk-ltkl",
    label: "PPATK LTKL (Indonesia)",
    jurisdiction: "Indonesia",
    regulation: "PPATK Laporan Transaksi Keuangan Transfer Dana Dari dan Ke Luar Negeri (LTKL), cross-border funds transfer report",
    reference: "https://ifii.ppatk.go.id/id/Web/Berita/detil/223/",
    columns: [
      { key: "date", label: "Tanggal transaksi (transaction date, UTC)" },
      { key: "recordType", label: "Jenis catatan (record type)" },
      { key: "direction", label: "Arah transfer (direction)" },
      { key: "amountUsdc", label: "Nilai transaksi (amount)" },
      { key: "currency", label: "Mata uang (currency)" },
      { key: "corridorCountry", label: "Negara asal/tujuan (corridor country)" },
      { key: "originatorId", label: "Identitas pengirim (originator identifier)" },
      { key: "originatorAccount", label: "Rekening pengirim (originator account)" },
      { key: "beneficiaryId", label: "Identitas penerima (beneficiary identifier)" },
      { key: "beneficiaryAccount", label: "Rekening penerima (beneficiary account)" },
      { key: "originatingVasp", label: "PJK pengirim (originating provider)" },
      { key: "beneficiaryVasp", label: "PJK penerima (beneficiary provider)" },
      { key: "txHash", label: "Referensi transaksi (Stellar transaction hash)" },
      { key: "reference", label: "Referensi on-chain (commitment / audit hash)" },
      { key: "disclosure", label: "Pengungkapan selektif (selective disclosure)" },
      { key: "notes", label: "Keterangan (notes)" },
    ],
  },
  {
    id: "eu-tfr",
    label: "EU TFR",
    jurisdiction: "European Union",
    regulation: "Regulation (EU) 2023/1113 (Transfer of Funds Regulation), information accompanying transfers of crypto-assets",
    reference: "https://eur-lex.europa.eu/eli/reg/2023/1113/oj",
    columns: [
      { key: "date", label: "Transfer date (UTC)" },
      { key: "txHash", label: "Transaction identifier (Stellar transaction hash)" },
      { key: "recordType", label: "Record type" },
      { key: "direction", label: "Direction" },
      { key: "amountUsdc", label: "Amount" },
      { key: "currency", label: "Crypto-asset" },
      { key: "originatorId", label: "Originator name / address / official identifier" },
      { key: "originatorAccount", label: "Originator account / DLT address" },
      { key: "beneficiaryId", label: "Beneficiary name / official identifier" },
      { key: "beneficiaryAccount", label: "Beneficiary account / DLT address" },
      { key: "originatingVasp", label: "Originator CASP" },
      { key: "beneficiaryVasp", label: "Beneficiary CASP" },
      { key: "corridorCountry", label: "Destination country" },
      { key: "travelRuleRef", label: "Travel Rule message reference" },
      { key: "reference", label: "On-chain reference (commitment / audit hash)" },
      { key: "disclosure", label: "Selective disclosure" },
      { key: "notes", label: "Notes" },
    ],
  },
  {
    id: "bsp-php-50k",
    label: "BSP PHP 50,000 threshold (Philippines)",
    jurisdiction: "Philippines",
    regulation: "BSP Circular 1108 (VASP guidelines), originator and beneficiary information required for virtual-asset transfers of PHP 50,000 or more",
    reference: "https://www.bsp.gov.ph/Regulations/Issuances/2021/1108.pdf",
    columns: [
      { key: "date", label: "Transaction date (UTC)" },
      { key: "txHash", label: "Transaction identifier (Stellar transaction hash)" },
      { key: "recordType", label: "Record type" },
      { key: "direction", label: "Direction" },
      { key: "amountUsdc", label: "Amount (USDC)" },
      { key: "amountPhp", label: "Amount (PHP, at the stated rate)" },
      { key: "phpRate", label: "PHP per USD used" },
      { key: "thresholdTest", label: "PHP 50,000 threshold test" },
      { key: "originatorId", label: "Originator identity" },
      { key: "originatorAccount", label: "Originator account" },
      { key: "beneficiaryId", label: "Beneficiary identity" },
      { key: "beneficiaryAccount", label: "Beneficiary account / DLT address" },
      { key: "originatingVasp", label: "Originating VASP" },
      { key: "beneficiaryVasp", label: "Beneficiary VASP" },
      { key: "reference", label: "On-chain reference (commitment / audit hash)" },
      { key: "disclosure", label: "Selective disclosure" },
      { key: "notes", label: "Notes" },
    ],
  },
];
export const presetById = (id: PresetId): Preset => PRESETS.find((p) => p.id === id) || PRESETS[0];

const BSP_THRESHOLD_PHP = 50_000;
const NO_VALUE = ""; // a column that does not apply to this row

const DIRECTION: Record<string, string> = {
  deposit: "into corridor (on-ramp, sending edge)",
  withdraw: "out of corridor (off-ramp, receiving edge)",
  transfer: "shielded transfer inside the corridor (no edge movement)",
  root: "tree advance (no value movement)",
};

const corridorCountry = (code?: string): string => {
  const c = code ? CORRIDORS.find((x) => x.code === code) : undefined;
  return c ? `${c.country} (${c.currency})` : ANCHOR_HELD;
};

function blankRow(): ReportRow {
  return {
    recordType: NO_VALUE, date: NO_VALUE, ledger: NO_VALUE, txHash: NO_VALUE, direction: NO_VALUE, amountUsdc: NO_VALUE, currency: "USDC",
    corridorCountry: ANCHOR_HELD, originatorId: ANCHOR_HELD, originatorAccount: ANCHOR_HELD, beneficiaryId: ANCHOR_HELD, beneficiaryAccount: ANCHOR_HELD,
    originatingVasp: ANCHOR_HELD, beneficiaryVasp: ANCHOR_HELD, reference: NO_VALUE, disclosure: NO_VALUE, travelRuleRef: ANCHOR_HELD,
    amountPhp: NO_VALUE, phpRate: NO_VALUE, thresholdTest: NO_VALUE, notes: NO_VALUE,
  };
}

function applyPhp(row: ReportRow, usdc: string | null, fx: PhpRate | null | undefined, shielded: boolean): void {
  if (shielded) {
    row.thresholdTest = "not testable from chain (amount shielded)";
    return;
  }
  if (usdc == null) return;
  if (!fx) {
    row.thresholdTest = "PHP rate unavailable";
    return;
  }
  const php = Number(usdc) * fx.phpPerUsd;
  row.amountPhp = php.toFixed(2);
  row.phpRate = String(fx.phpPerUsd);
  row.thresholdTest = php >= BSP_THRESHOLD_PHP ? "at or above PHP 50,000 (originator and beneficiary information required)" : "below PHP 50,000";
}

function eventRow(ev: PoolEvent, fx?: PhpRate | null): ReportRow {
  const row = blankRow();
  row.recordType = `pool event: ${ev.kind}`;
  row.date = ev.closedAt;
  row.ledger = String(ev.ledger);
  row.txHash = ev.txHash;
  row.direction = DIRECTION[ev.kind] || ev.kind;
  const usdc = ev.amountStroops != null ? fmtUsdc(ev.amountStroops) : null;
  const shielded = ev.kind === "transfer";
  row.amountUsdc = usdc ?? (shielded ? "shielded" : NO_VALUE);
  if (ev.kind === "root") row.currency = NO_VALUE;
  if (ev.commitment) row.reference = ev.commitment;
  if (ev.recipient) row.beneficiaryAccount = ev.recipient;
  applyPhp(row, usdc, fx, shielded);
  row.notes =
    ev.kind === "deposit"
      ? "public on-ramp edge; the depositor is authenticated on-chain and ASP-allow-listed in-circuit"
      : ev.kind === "withdraw"
        ? "public off-ramp edge; recipient address is on-chain, the beneficiary's identity is held by the receiving anchor"
        : ev.kind === "transfer"
          ? "amount and counterparties are shielded by design"
          : "Merkle root advanced with a verified merkleUpdate proof";
  return row;
}

function disclosureRow(d: DisclosureRecord, fx?: PhpRate | null): ReportRow {
  const row = blankRow();
  row.recordType = `selective disclosure: ${d.type}`;
  row.date = d.verifiedAt;
  row.txHash = d.anchorTx || NO_VALUE;
  row.direction = "selective disclosure (no value movement)";
  row.amountUsdc = d.disclosedUsdc ?? "hidden (see selective disclosure)";
  row.corridorCountry = corridorCountry(d.corridor);
  row.reference = d.commitment;
  row.disclosure = `${d.summary}; verified on-chain by ${d.verifier}; audit context ${d.auditContextHash}`;
  row.travelRuleRef = d.auditContextHash;
  applyPhp(row, d.disclosedUsdc ?? null, fx, d.disclosedUsdc == null);
  row.notes = d.anchorTx ? "receipt anchored on-chain (SHA-256 memo)" : "receipt verified in-browser and on the live Stellar verifier";
  return row;
}

function auditRequestRow(a: AuditRequestRecord): ReportRow {
  const row = blankRow();
  row.recordType = "audit request: aggregate";
  row.date = a.registeredAt;
  row.txHash = a.txHash || NO_VALUE;
  row.direction = "audit request registered on-chain (no value movement)";
  row.amountUsdc = `cap ${fmtUsdc(a.capStroops)}`;
  row.reference = a.issuedHash;
  row.disclosure = `${a.commitments.length} commitment(s) required: ${a.commitments.join(" ")}`;
  row.travelRuleRef = a.issuedHash;
  row.thresholdTest = "not applicable";
  row.notes = "disclose_aggregate rejects any hash not registered; the holder cannot report a subset";
  return row;
}

// ---- the report ----
export type ReportInput = {
  preset: PresetId;
  events: PoolEvent[];
  rpc: { oldestLedger: number; latestLedger: number };
  disclosures: DisclosureRecord[];
  auditRequests: AuditRequestRecord[];
  policy: PolicySnapshot;
  window: { from: string; to: string }; // YYYY-MM-DD, inclusive, UTC
  fx?: PhpRate | null;
  generatedAt?: string;
};
export type ComplianceReport = {
  header: Record<string, string | number | null>;
  columns: { key: RowKey; label: string }[];
  rows: Record<string, string>[]; // keyed by column label, in column order
};

const dayStart = (d: string) => Date.parse(d + "T00:00:00.000Z");
const dayEnd = (d: string) => Date.parse(d + "T23:59:59.999Z");

export function buildReport(input: ReportInput): ComplianceReport {
  const preset = presetById(input.preset);
  const from = dayStart(input.window.from);
  const to = dayEnd(input.window.to);
  const inWindow = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= from && t <= to;
  };
  const fx = preset.id === "bsp-php-50k" ? input.fx : null;

  const events = input.events.filter((e) => inWindow(e.closedAt)).sort((a, b) => a.ledger - b.ledger);
  const disclosures = input.disclosures.filter((d) => inWindow(d.verifiedAt));
  const requests = input.auditRequests.filter((a) => inWindow(a.registeredAt));
  const all: ReportRow[] = [...events.map((e) => eventRow(e, fx)), ...disclosures.map((d) => disclosureRow(d, fx)), ...requests.map(auditRequestRow)];
  all.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  const first = events[0];
  const last = events[events.length - 1];
  const header: ComplianceReport["header"] = {
    report: "Tukar compliance export pack",
    preset: preset.label,
    jurisdiction: preset.jurisdiction,
    regulation: preset.regulation,
    regulationReference: preset.reference,
    generatedAt: input.generatedAt || new Date().toISOString(),
    network: PASSPHRASE,
    poolContract: POOL,
    "dataWindow.selectedFrom": input.window.from,
    "dataWindow.selectedTo": input.window.to,
    "dataWindow.fromLedger": first ? first.ledger : null,
    "dataWindow.fromLedgerTime": first ? first.closedAt : null,
    "dataWindow.toLedger": last ? last.ledger : null,
    "dataWindow.toLedgerTime": last ? last.closedAt : null,
    "dataWindow.rpcOldestLedger": input.rpc.oldestLedger,
    "dataWindow.rpcLatestLedger": input.rpc.latestLedger,
    "dataWindow.note": RPC_RETENTION_NOTE,
    piiNote: `Tukar holds no personal data. Every field exported as "${ANCHOR_HELD}" is held by the licensed anchor (the KYC provider) at the fiat edge and must be obtained from it. Nothing in this file is fabricated.`,
    "counts.poolEvents": events.length,
    "counts.disclosures": disclosures.length,
    "counts.auditRequests": requests.length,
    "policy.aspAllowListRoot": input.policy.aspRoot,
    "policy.denyListEntries": input.policy.denyList ? input.policy.denyList.length : null,
    "policy.readAt": input.policy.readAt,
  };
  if (preset.id === "bsp-php-50k") {
    header["fx.thresholdPhp"] = BSP_THRESHOLD_PHP;
    header["fx.phpPerUsd"] = fx ? fx.phpPerUsd : null;
    header["fx.source"] = fx ? fx.source : "unavailable";
    header["fx.fetchedAt"] = fx ? fx.fetchedAt : null;
    header["fx.note"] = "USDC is treated at par with USD for the threshold test; the PHP figure is indicative at the stated rate and time.";
  }
  const rows = all.map((r) => Object.fromEntries(preset.columns.map((c) => [c.label, r[c.key]])));
  return { header, columns: preset.columns, rows };
}

// ---- serializers ----
/** RFC 4180 field escaping: quote when the field holds a comma, a quote, or a line break; double inner quotes. */
export function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV: a key,value header block, a blank line, then the preset's columns and rows. CRLF line ends. */
export function toCsv(report: ComplianceReport): string {
  const lines: string[] = ["key,value"];
  for (const [k, v] of Object.entries(report.header)) lines.push(`${csvEscape(k)},${csvEscape(v)}`);
  lines.push("");
  lines.push(report.columns.map((c) => csvEscape(c.label)).join(","));
  for (const row of report.rows) lines.push(report.columns.map((c) => csvEscape(row[c.label])).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function toJson(report: ComplianceReport): string {
  return JSON.stringify(report, null, 2);
}

/** USD to PHP from the same public FX source the receiver app uses for non-oracle corridors. */
export async function fetchPhpRate(): Promise<PhpRate | null> {
  try {
    const j = await (await fetch("https://open.er-api.com/v6/latest/USD")).json();
    const v = j && j.rates && j.rates.PHP;
    if (typeof v !== "number" || !(v > 0)) return null;
    const at = j.time_last_update_utc ? new Date(j.time_last_update_utc) : new Date();
    return { phpPerUsd: v, source: "open.er-api.com (USD base)", fetchedAt: (Number.isNaN(at.getTime()) ? new Date() : at).toISOString() };
  } catch {
    return null;
  }
}

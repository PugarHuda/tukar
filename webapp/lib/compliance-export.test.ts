import { describe, it, expect } from "vitest";
import {
  csvEscape,
  toCsv,
  toJson,
  buildReport,
  presetById,
  PRESETS,
  ANCHOR_HELD,
  disclosureFromReceipt,
  type ReportInput,
} from "./compliance-export";

const events = [
  { kind: "deposit", ledger: 100, closedAt: "2026-08-20T10:00:00Z", txHash: "aa".repeat(32), amountStroops: "5000000000", commitment: "123" },
  { kind: "transfer", ledger: 101, closedAt: "2026-08-21T10:00:00Z", txHash: "bb".repeat(32) },
  { kind: "withdraw", ledger: 102, closedAt: "2026-08-22T10:00:00Z", txHash: "cc".repeat(32), amountStroops: "25000000000", recipient: "GABC" },
  { kind: "root", ledger: 103, closedAt: "2026-08-23T10:00:00Z", txHash: "dd".repeat(32) },
];
const base: ReportInput = {
  preset: "ppatk-ltkl",
  events,
  rpc: { oldestLedger: 1, latestLedger: 200 },
  disclosures: [
    { type: "exact", commitment: "123", summary: "discloses $500 USDC", verifiedAt: "2026-08-22T12:00:00Z", verifier: "CVER", auditContextHash: "7", disclosedUsdc: "500", corridor: "ID" },
    { type: "threshold", commitment: "456", summary: "proves ≤ $1000 USDC (amount hidden)", verifiedAt: "2026-08-22T13:00:00Z", verifier: "CTHR", auditContextHash: "8" },
  ],
  auditRequests: [{ issuedHash: "999", commitments: ["123", "456"], capStroops: "50000000000", txHash: "ee".repeat(32), registeredAt: "2026-08-22T14:00:00Z" }],
  policy: { aspRoot: "ab".repeat(32), denyList: ["1", "2"], readAt: "2026-08-23T00:00:00Z" },
  window: { from: "2026-08-20", to: "2026-08-23" },
  generatedAt: "2026-08-24T00:00:00Z",
};

describe("csvEscape (RFC 4180)", () => {
  it("leaves plain fields alone and quotes the special ones", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape(12)).toBe("12");
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("cr\r")).toBe('"cr\r"');
  });
});

describe("buildReport", () => {
  it("filters to the date window and orders rows by time", () => {
    const r = buildReport({ ...base, window: { from: "2026-08-21", to: "2026-08-22" } });
    expect(r.header["counts.poolEvents"]).toBe(2); // transfer + withdraw
    expect(r.header["counts.disclosures"]).toBe(2);
    expect(r.header["counts.auditRequests"]).toBe(1);
    expect(r.header["dataWindow.fromLedger"]).toBe(101);
    expect(r.header["dataWindow.fromLedgerTime"]).toBe("2026-08-21T10:00:00Z");
    expect(r.header["dataWindow.toLedger"]).toBe(102);
    expect(r.header["dataWindow.toLedgerTime"]).toBe("2026-08-22T10:00:00Z");
    const dates = r.rows.map((row) => row["Tanggal transaksi (transaction date, UTC)"]);
    expect(dates).toEqual([...dates].sort());
  });

  it("states the window, retention and the anchor-held rule in the header", () => {
    const r = buildReport(base);
    expect(String(r.header["dataWindow.note"])).toMatch(/7 days/);
    expect(String(r.header.piiNote)).toContain(ANCHOR_HELD);
    expect(r.header["dataWindow.rpcOldestLedger"]).toBe(1);
    expect(r.header["policy.denyListEntries"]).toBe(2);
    expect(r.header.poolContract).toMatch(/^C[A-Z2-7]{55}$/);
  });

  it("maps PPATK LTKL fields and never fabricates identities", () => {
    const r = buildReport(base);
    const cols = presetById("ppatk-ltkl").columns.map((c) => c.label);
    expect(Object.keys(r.rows[0])).toEqual(cols);
    const dep = r.rows.find((row) => row["Jenis catatan (record type)"] === "pool event: deposit")!;
    expect(dep["Nilai transaksi (amount)"]).toBe("500");
    expect(dep["Mata uang (currency)"]).toBe("USDC");
    expect(dep["Arah transfer (direction)"]).toMatch(/into corridor/);
    expect(dep["Identitas pengirim (originator identifier)"]).toBe(ANCHOR_HELD);
    expect(dep["Identitas penerima (beneficiary identifier)"]).toBe(ANCHOR_HELD);
    expect(dep["Negara asal/tujuan (corridor country)"]).toBe(ANCHOR_HELD);
    expect(dep["Referensi on-chain (commitment / audit hash)"]).toBe("123");
    const tr = r.rows.find((row) => row["Jenis catatan (record type)"] === "pool event: transfer")!;
    expect(tr["Nilai transaksi (amount)"]).toBe("shielded");
    const wd = r.rows.find((row) => row["Jenis catatan (record type)"] === "pool event: withdraw")!;
    expect(wd["Rekening penerima (beneficiary account)"]).toBe("GABC"); // real on-chain recipient
    expect(wd["Nilai transaksi (amount)"]).toBe("2500");
    const disc = r.rows.find((row) => row["Jenis catatan (record type)"] === "selective disclosure: exact")!;
    expect(disc["Negara asal/tujuan (corridor country)"]).toBe("Indonesia (IDR)");
    expect(disc["Nilai transaksi (amount)"]).toBe("500");
    const thr = r.rows.find((row) => row["Jenis catatan (record type)"] === "selective disclosure: threshold")!;
    expect(thr["Nilai transaksi (amount)"]).toMatch(/hidden/);
  });

  it("maps EU TFR fields", () => {
    const r = buildReport({ ...base, preset: "eu-tfr" });
    expect(Object.keys(r.rows[0])).toEqual(presetById("eu-tfr").columns.map((c) => c.label));
    const wd = r.rows.find((row) => row["Record type"] === "pool event: withdraw")!;
    expect(wd["Beneficiary account / DLT address"]).toBe("GABC");
    expect(wd["Originator CASP"]).toBe(ANCHOR_HELD);
    expect(wd["Travel Rule message reference"]).toBe(ANCHOR_HELD);
    expect(wd["Crypto-asset"]).toBe("USDC");
    const disc = r.rows.find((row) => row["Record type"] === "selective disclosure: exact")!;
    expect(disc["Travel Rule message reference"]).toBe("7");
    expect(r.header["fx.phpPerUsd"]).toBeUndefined();
  });

  it("applies the BSP PHP 50,000 threshold at the stated rate, and says so when no rate", () => {
    const fx = { phpPerUsd: 56.5, source: "test", fetchedAt: "2026-08-24T00:00:00Z" };
    const r = buildReport({ ...base, preset: "bsp-php-50k", fx });
    expect(r.header["fx.phpPerUsd"]).toBe(56.5);
    expect(r.header["fx.thresholdPhp"]).toBe(50000);
    const dep = r.rows.find((row) => row["Record type"] === "pool event: deposit")!;
    expect(dep["Amount (PHP, at the stated rate)"]).toBe("28250.00");
    expect(dep["PHP 50,000 threshold test"]).toMatch(/^below/);
    const wd = r.rows.find((row) => row["Record type"] === "pool event: withdraw")!;
    expect(wd["Amount (PHP, at the stated rate)"]).toBe("141250.00");
    expect(wd["PHP 50,000 threshold test"]).toMatch(/^at or above/);
    const tr = r.rows.find((row) => row["Record type"] === "pool event: transfer")!;
    expect(tr["PHP 50,000 threshold test"]).toMatch(/shielded/);
    const none = buildReport({ ...base, preset: "bsp-php-50k", fx: null });
    expect(none.header["fx.source"]).toBe("unavailable");
    expect(none.rows.find((row) => row["Record type"] === "pool event: deposit")!["PHP 50,000 threshold test"]).toBe("PHP rate unavailable");
  });

  it("has three presets with distinct column sets", () => {
    expect(PRESETS.map((p) => p.id)).toEqual(["ppatk-ltkl", "eu-tfr", "bsp-php-50k"]);
    for (const p of PRESETS) expect(new Set(p.columns.map((c) => c.key)).size).toBe(p.columns.length);
  });
});

describe("serializers", () => {
  it("writes a CSV with a header block, a blank line, then escaped rows and CRLF endings", () => {
    const r = buildReport({ ...base, disclosures: [{ ...base.disclosures[0], summary: 'says "hi", twice' }] });
    const csv = toCsv(r);
    expect(csv.startsWith("key,value\r\n")).toBe(true);
    expect(csv).toContain("\r\n\r\n"); // blank line between the header block and the table
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).toContain('"says ""hi"", twice; verified on-chain by CVER; audit context 7"');
    const lines = csv.split("\r\n");
    const table = lines.slice(lines.indexOf("") + 1).filter(Boolean);
    expect(table[0].split(",").length).toBeGreaterThan(10); // column labels (no label contains a comma)
    expect(table.length).toBe(1 + r.rows.length);
  });

  it("writes JSON that round-trips the report", () => {
    const r = buildReport(base);
    expect(JSON.parse(toJson(r))).toEqual(r);
  });
});

describe("disclosureFromReceipt", () => {
  it("takes every figure from publicSignals, by type", () => {
    const mk = (type: any, publicSignals: string[]) =>
      disclosureFromReceipt(
        { ok: true, type, local: true, onChain: true, commitment: publicSignals[0], summary: "s", bound: true },
        { kind: "tukar-audit-receipt", version: 1, type, verifiedOnChain: true, network: "n", verifier: "V", publicSignals, proof: {} as any, anchor: { txHash: "T", sha256: "", network: "n" } },
        "PH",
      );
    const exact = mk("exact", ["1", "5000000000", "7"]);
    expect(exact.disclosedUsdc).toBe("500");
    expect(exact.auditContextHash).toBe("7");
    expect(exact.anchorTx).toBe("T");
    expect(exact.corridor).toBe("PH");
    expect(mk("threshold", ["1", "2", "8"]).auditContextHash).toBe("8");
    expect(mk("range", ["1", "2", "3", "9"]).auditContextHash).toBe("9");
    expect(mk("aggregate", [...Array(11).fill("0"), "11", "12"]).auditContextHash).toBe("11");
    expect(mk("threshold", ["1", "2", "8"]).disclosedUsdc).toBeUndefined();
  });
});

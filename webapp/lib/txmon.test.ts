import { describe, it, expect } from "vitest";
import * as Sdk from "@stellar/stellar-sdk";
import {
  invocations,
  failureKind,
  contractErrorFrom,
  errorName,
  severityForError,
  watchedOnly,
  evaluate,
  unseen,
  alertPayload,
  THRESHOLDS,
  WATCHED,
  type TxRecord,
} from "./txmon";
import { POOL, SOURCE } from "./constants";
import type { MonEvent } from "./anomaly";

// Real result XDR captured from Stellar testnet on 2026-09-11: the reverting withdraw this
// monitor was proved against (tx 3809e755…, PoolError::InvalidAmount #5) and a successful pool
// call by the demo key (tx a869eed4…). Real bytes, so the decoder is tested against the wire.
const REVERTED_WITHDRAW_RESULT = "AAAAAAABw0//////AAAAAQAAAAAAAAAY/////gAAAAA=";
const SUCCESS_RESULT = "AAAAAAAASB8AAAABQqUGKIvB7yMxUe/X0LVa3Y/td6QlXY8DJvpvgBlQGv4AAAAAAAAAAAAAAAAAAAABAAAAAAAAABgAAAAA6nZfuRS4yJuDMrs9gMf1zX4pvwS9axw74wmWFOc0j+MAAAAAAAAAAA==";

// A real envelope, built by the SDK the same way a submitted one is, so invocations() is exercised
// against actual XDR rather than a hand-written fixture.
const envelope = (contract: string, fn: string, feeBump = false): string => {
  const tx = new Sdk.TransactionBuilder(new Sdk.Account(SOURCE, "1"), { fee: "100", networkPassphrase: Sdk.Networks.TESTNET })
    .addOperation(new Sdk.Contract(contract).call(fn))
    .setTimeout(0)
    .build();
  if (!feeBump) return tx.toEnvelope().toXdr("base64");
  tx.sign(Sdk.Keypair.random());
  return Sdk.TransactionBuilder.buildFeeBumpTransaction(Sdk.Keypair.random(), "1000", tx, Sdk.Networks.TESTNET).toEnvelope().toXdr("base64");
};

const rec = (o: Partial<TxRecord>): TxRecord => ({
  hash: "h",
  at: 1_789_000_000,
  ledger: 4_621_382,
  successful: true,
  source: SOURCE,
  invocations: [{ contract: POOL, fn: "deposit" }],
  errorRecoverable: false,
  ...o,
});

describe("invocations", () => {
  it("reads the contract and function out of a transaction envelope", () => {
    expect(invocations(envelope(POOL, "set_deny_list"))).toEqual([{ contract: POOL, fn: "set_deny_list" }]);
  });
  it("unwraps a fee bump, so a sponsored invocation is not invisible", () => {
    expect(invocations(envelope(POOL, "withdraw", true))).toEqual([{ contract: POOL, fn: "withdraw" }]);
  });
  it("returns nothing for undecodable input instead of throwing", () => {
    expect(invocations("not-base64-xdr")).toEqual([]);
    expect(invocations("")).toEqual([]);
  });
});

describe("failureKind", () => {
  it("names the InvokeHostFunction failure on a reverted transaction", () => {
    expect(failureKind(REVERTED_WITHDRAW_RESULT)).toBe("Trapped");
  });
  it("returns null for a successful transaction and for garbage", () => {
    expect(failureKind(SUCCESS_RESULT)).toBeNull();
    expect(failureKind("garbage")).toBeNull();
  });
});

// The `error` diagnostic event the live pool actually emitted for that reverting withdraw,
// captured verbatim from getTransaction. This is the one signal getEvents cannot give at all.
const REAL_ERROR_DIAG =
  "AAAAAAAAAAAAAAABUYgAWHKGF+Bmp8bJHeZJLP1mJJ3HV0xdPOnYpCYatMMAAAACAAAAAAAAAAIAAAAPAAAABWVycm9yAAAAAAAAAgAAAAAAAAAFAAAAEAAAAAEAAAACAAAADgAAABtmYWlsaW5nIHdpdGggY29udHJhY3QgZXJyb3IAAAAAAwAAAAU=";

describe("contractErrorFrom", () => {
  it("pulls the contract and the exact error code out of a real diagnostic event", () => {
    const d = Sdk.xdr.DiagnosticEvent.fromXDR(REAL_ERROR_DIAG, "base64");
    expect(contractErrorFrom([d])).toEqual({ contract: POOL, code: 5, name: "InvalidAmount" });
  });
  it("skips diagnostics that carry no error, so the first real error wins", () => {
    const noise = Sdk.xdr.DiagnosticEvent.fromXDR(REAL_ERROR_DIAG, "base64");
    expect(contractErrorFrom([noise, noise])?.code).toBe(5);
  });
  it("is null with no diagnostics, which is what a public RPC gives outside its retention window", () => {
    expect(contractErrorFrom(undefined)).toBeNull();
    expect(contractErrorFrom([])).toBeNull();
  });
});

describe("errorName", () => {
  it("resolves pool codes and refuses to name a code from a contract whose enum we do not hold", () => {
    expect(errorName(POOL, 2)).toBe("NullifierUsed");
    expect(errorName(POOL, 5)).toBe("InvalidAmount");
    expect(errorName(POOL, 14)).toBe("NonCanonicalField");
    expect(errorName("CSOMEOTHERCONTRACT", 2)).toBeUndefined();
    expect(errorName(POOL, 99)).toBeUndefined();
  });
});

describe("severityForError", () => {
  it("is structural: integrity guards page, a fail-closed oracle warns, slippage is expected", () => {
    expect(severityForError(POOL, 2)).toBe("critical"); // NullifierUsed
    expect(severityForError(POOL, 7)).toBe("critical"); // ProofRejected
    expect(severityForError(POOL, 14)).toBe("critical"); // NonCanonicalField
    expect(severityForError(POOL, 11)).toBe("warning"); // FxUnavailable
    expect(severityForError(POOL, 12)).toBe("info"); // SlippageExceeded
    expect(severityForError(POOL, 5)).toBe("warning"); // InvalidAmount, a caller bug
    expect(severityForError(null, 2)).toBe("warning"); // unknown contract: never claim a pool code
  });
});

describe("watchedOnly", () => {
  it("keeps transactions touching a watched contract and drops the rest", () => {
    const kept = rec({ hash: "a" });
    const dropped = rec({ hash: "b", invocations: [{ contract: "CUNRELATED", fn: "swap" }] });
    const none = rec({ hash: "c", invocations: [] });
    expect(watchedOnly([kept, dropped, none]).map((r) => r.hash)).toEqual(["a"]);
  });
  it("watches the pool, both preview pools, the USDC SAC, the registry and both reserves contracts", () => {
    expect(Object.keys(WATCHED)).toHaveLength(7);
    expect(WATCHED[POOL]).toBe("pool");
  });
});

describe("evaluate", () => {
  const base = { adminAccount: SOURCE, adminEvents: [] as MonEvent[], windowTruncated: false };

  it("raises a reverted invocation to the severity of its contract error code", () => {
    const f = evaluate({
      ...base,
      records: [rec({ hash: "x", successful: false, failure: "Trapped", errorRecoverable: true, error: { contract: POOL, code: 2, name: "NullifierUsed" }, invocations: [{ contract: POOL, fn: "withdraw" }] })],
    });
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("critical");
    expect(f[0].rule).toBe("failed-invocation");
    expect(f[0].detail).toContain("NullifierUsed (#2)");
    expect(f[0].id).toBe("failed-invocation:x");
  });

  it("still reports a failure whose error code aged out of RPC retention, and says so", () => {
    const f = evaluate({ ...base, records: [rec({ hash: "y", successful: false, failure: "Trapped", errorRecoverable: false, invocations: [{ contract: POOL, fn: "withdraw" }] })] });
    expect(f[0].severity).toBe("warning");
    expect(f[0].detail).toContain("aged out of RPC retention");
  });

  it("flags a successful admin setter, the only on-chain evidence the live pool leaves for one", () => {
    const f = evaluate({ ...base, records: [rec({ hash: "z", invocations: [{ contract: POOL, fn: "set_deny_list" }] })] });
    expect(f).toHaveLength(1);
    expect(f[0].rule).toBe("admin-setter");
    expect(f[0].severity).toBe("critical");
    expect(f[0].title).toContain("set_deny_list");
  });

  it("ignores ordinary successful traffic and setters from a non-admin account", () => {
    const f = evaluate({
      ...base,
      records: [rec({ hash: "a", invocations: [{ contract: POOL, fn: "deposit" }] }), rec({ hash: "b", source: "GSOMEONEELSE", invocations: [{ contract: POOL, fn: "set_deny_list" }] })],
    });
    expect(f).toEqual([]);
  });

  it("carries admin events through and sorts critical first", () => {
    const ev: MonEvent = { kind: "tl_prop", contract: POOL, ledger: 1, closedAt: 10, txHash: "t", detail: "set_deny_list" };
    const f = evaluate({
      ...base,
      adminEvents: [ev],
      records: [rec({ hash: "x", successful: false, failure: "Trapped", error: { contract: POOL, code: 7, name: "ProofRejected" }, errorRecoverable: true, invocations: [{ contract: POOL, fn: "withdraw" }] })],
      windowTruncated: true,
    });
    expect(f.map((x) => x.severity)).toEqual(["critical", "warning", "info"]);
    expect(f.map((x) => x.rule)).toEqual(["failed-invocation", "admin-event", "window-truncated"]);
  });
});

describe("unseen", () => {
  const f = (id: string, severity: "critical" | "warning" | "info") => ({ id, rule: "r", severity, title: "t", detail: "d", at: 1 });
  it("alerts on critical and warning once each, never on info", () => {
    const all = [f("a", "critical"), f("b", "warning"), f("c", "info")];
    expect(unseen(all, []).map((x) => x.id)).toEqual(["a", "b"]);
    expect(unseen(all, ["a"]).map((x) => x.id)).toEqual(["b"]);
    expect(unseen(all, ["a", "b"])).toEqual([]);
  });
});

describe("alertPayload", () => {
  it("opens the operator console and keeps the body inside a notification's length", () => {
    const p = alertPayload({ id: "i", rule: "r", severity: "critical", title: "Reverted: withdraw on the pool", detail: "x".repeat(500), at: 1 });
    expect(p.url).toBe("/operator");
    expect(p.title.startsWith("Critical:")).toBe(true);
    expect(p.body).toHaveLength(300);
  });
});

describe("THRESHOLDS", () => {
  it("sets only the rules that hold without a baseline and leaves the rate rules explicitly unset", () => {
    const set = THRESHOLDS.filter((t) => t.value).map((t) => t.rule);
    const unset = THRESHOLDS.filter((t) => !t.value).map((t) => t.rule);
    expect(set).toEqual(["failed-invocation", "admin-setter", "admin-event"]);
    expect(unset).toEqual(["deposit-velocity", "near-cap-structuring", "repeated-actor", "revert-rate"]);
    // Every unset row has to say why, or it reads as an oversight rather than a decision.
    for (const t of THRESHOLDS.filter((x) => !x.value)) expect(t.note).toMatch(/No baseline/);
  });
});

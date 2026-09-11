// Shared guards for the circuit-soundness suites (test-negative / test-aggregate /
// test-asp-widened / test-fullprove).
//
// WHY THIS FILE EXISTS. A negative case written as
//
//     try { await fullProve(badInput, WASM, ZKEY); fail(); } catch { pass(); }
//
// is worth nothing: a renamed artifact, a typo'd path, a bad import, a wrong-arity input
// or a zkey/wasm mismatch ALL throw, and all of them score as "rejected (expected)". The
// suite goes green while testing nothing. `rejectedByCircuit` makes a negative case count
// ONLY when circom's witness generator refused the witness, and `requireArtifacts` makes a
// missing file abort the run instead of decorating it with false passes.
import { existsSync } from "node:fs";

// circuits/build/ is gitignored, so prefer a freshly-built artifact when it is there
// (local dev) and fall back to the committed frontend/circuit/* (what CI has).
export const pick = (build, committed) => (existsSync(build) ? build : committed);

// A missing artifact is an INFRASTRUCTURE failure, not a test result. Abort loudly.
export function requireArtifacts(...paths) {
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length) {
    console.error(`\nMISSING CIRCUIT ARTIFACTS — this suite cannot run:\n  ${missing.join("\n  ")}\n`);
    process.exit(1);
  }
}

// circom's witness generator reports an unsatisfied constraint as, verbatim:
//   "Error: Assert Failed. Error in template Compliance_76 line: 58"
// Nothing else in the proving path produces that string — ENOENT is "no such file or
// directory", an arity mismatch is "Too many values for input signal x", a bad import is a
// module error. So "Assert Failed" is exactly "the circuit refused this witness", and any
// other throw must FAIL the negative case rather than pass it.
export const rejectedByCircuit = (e) => /Assert Failed/.test(String(e && e.message));

// Re-throw anything that is not a constraint violation, with the name of the case attached,
// so the suite's own catch/report path cannot silently score it as a rejection.
export function assertConstraintFailure(name, e) {
  if (!rejectedByCircuit(e)) {
    throw new Error(`${name}: threw, but NOT from a circuit constraint — ${String(e && e.message).split("\n")[0]}`);
  }
}

// Shared read-only Soroban RPC layer: one rpc.Server plus the simulate() helper the pool /
// reserves / oracle reads run through. Server-safe (no browser APIs). Returns a tagged SimResult
// so each caller decides how to treat a simulation error instead of this throwing.
// Every simulate / send is wrapped in a Sentry span (no-op with no DSN) tagged with the contract
// and method, so a slow oracle read or a stuck submit is visible per call in a trace.
import * as Sdk from "@stellar/stellar-sdk";
import * as Sentry from "@sentry/nextjs";
import { RPC, PASSPHRASE, SOURCE } from "../constants";

export const server = new Sdk.rpc.Server(RPC);

export type SimResult = { ok: false; error: unknown } | { ok: true; value: any };

export async function simulate(contractId: string, method: string, ...args: any[]): Promise<SimResult> {
  return Sentry.startSpan({ name: "soroban.simulate", op: "soroban.rpc", attributes: { contract: contractId, method } }, async () => {
    const source = await server.getAccount(SOURCE);
    const c = new Sdk.Contract(contractId);
    const tx = new Sdk.TransactionBuilder(source, { fee: "100", networkPassphrase: PASSPHRASE })
      .addOperation(c.call(method, ...args))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (Sdk.rpc.Api.isSimulationError(sim)) {
      return { ok: false, error: sim.error };
    }
    return { ok: true, value: Sdk.scValToNative(sim.result!.retval) };
  });
}

// Span for a write path (sign + sendTransaction + poll). The submits themselves live with their
// signers (lib/stellar.ts, lib/relayer.ts, lib/cctp.ts, lib/blend.ts); they wrap their send in this.
export function sendSpan<T>(contractId: string, method: string, fn: () => Promise<T>): Promise<T> {
  return Sentry.startSpan({ name: "soroban.send", op: "soroban.rpc", attributes: { contract: contractId, method } }, fn);
}

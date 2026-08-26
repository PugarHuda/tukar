// Shared read-only Soroban RPC layer: one rpc.Server plus the simulate() helper the pool /
// reserves / oracle reads run through. Server-safe (no browser APIs). Returns a tagged SimResult
// so each caller decides how to treat a simulation error instead of this throwing.
import * as Sdk from "@stellar/stellar-sdk";
import { RPC, PASSPHRASE, SOURCE } from "../constants";

export const server = new Sdk.rpc.Server(RPC);

export type SimResult = { ok: false; error: unknown } | { ok: true; value: any };

export async function simulate(contractId: string, method: string, ...args: any[]): Promise<SimResult> {
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
}

// Shared read-only Soroban RPC layer: one rpc.Server plus the simulate() helper the pool /
// reserves / oracle reads run through. Server-safe (no browser APIs). Returns a tagged SimResult
// so each caller decides how to treat a simulation error instead of this throwing.
// Every simulate / send is wrapped in a Sentry span (no-op with no DSN) tagged with the contract
// and method, so a slow oracle read or a stuck submit is visible per call in a trace.
import * as Sdk from "@stellar/stellar-sdk";
import * as Sentry from "@sentry/nextjs";
import { RPC, RPC_FALLBACK, RPC_TIMEOUT_MS, PASSPHRASE, SOURCE } from "../constants";
import { log, errMsg } from "../log";

// Transient = the primary never answered (DNS, refused, aborted, the timeout below) or answered
// 5xx. A 4xx or a JSON-RPC error body is a real answer and is never retried elsewhere.
export function isTransientRpcError(e: unknown): boolean {
  const status = (e as { response?: { status?: number } })?.response?.status;
  return status === undefined || status >= 500;
}

// Every rpc.Server method funnels into `httpClient.post(serverURL, jsonrpcBody)`, so wrapping
// that one method gives every caller (simulate, sendTransaction, contract.Client built with this
// server) the same failover: retry the SAME request once against RPC_FALLBACK, then forget about
// it, so the next call tries the primary again. Exported so the unit test can wrap a fake client.
type Post = (url: string, data?: any, config?: any) => Promise<any>;
export function withFailover<C extends { post: Post }>(client: C, primary = RPC, fallback = RPC_FALLBACK): C {
  const post: Post = client.post.bind(client);
  client.post = (async (url: string, data?: any, config?: any) => {
    try {
      return await post(url, data, config);
    } catch (e) {
      if (!url.startsWith(primary) || !isTransientRpcError(e)) throw e;
      log.warn("soroban rpc failover", { primary, fallback, method: (data as { method?: string })?.method, err: errMsg(e) });
      return post(url.replace(primary, fallback), data, config);
    }
  }) as C["post"];
  return client;
}

// Every rpc.Server the app uses comes from here. The SDK default is NO timeout, so a black-holed
// network (captive portal, dropped mobile link, Firefox offline) left a send hanging forever with
// no message. `Server` documents a `timeout` option but (16.2.0) never forwards it to its http
// client, so the ceiling is applied through the documented request interceptor instead; the
// fetch client turns `config.timeout` into an AbortSignal, which fails honestly.
export function makeServer(): Sdk.rpc.Server {
  const s = new Sdk.rpc.Server(RPC, { timeout: RPC_TIMEOUT_MS });
  s.httpClient.interceptors.request.use((config: any) => {
    config.timeout = config.timeout || RPC_TIMEOUT_MS;
    return config;
  });
  withFailover(s.httpClient);
  return s;
}
export const server = makeServer();

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

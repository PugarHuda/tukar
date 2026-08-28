// The ONE signAndSend wrapper every pool write (client depositOnChain / withdrawSubmit /
// registerRootOnChain / registerAuditRequest and the server relayer) routes through.
//
// Two very different failure classes, handled differently:
//   - PRE-SEND transient faults (sequence race on the shared demo key, testnet load-shedding
//     try_again_later / 429 / 50x, a simulate RPC blip): nothing reached the ledger, so rebuild
//     and resubmit.
//   - POST-SEND faults: the network already accepted the tx (sendTransaction returned PENDING).
//     The SDK then polls getTransaction with no catch, so a network blip there throws and the
//     hash is gone. Resubmitting here is the bug: a deposit lands twice (second reverts #10, the
//     UI shows "Deposit failed" while the USDC is already in the pool), a withdraw's second
//     submit reverts #2 "already spent" and the real hash is lost. So once a hash exists we NEVER
//     resubmit: we poll that hash (bounded) and treat SUCCESS as success.
// A contract revert Error(Contract,#N) is deterministic and never retried either way.
import { server as rpcServer } from "./rpc";

type Rpc = { getTransaction(hash: string): Promise<any> };

const _sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const _msg = (e: any) => String(e?.message ?? e ?? "");
const _isContractRevert = (e: any) => /Error\(Contract,\s*#\d+\)/.test(_msg(e));
const _isTransient = (e: any) =>
  !_isContractRevert(e) &&
  /txbadseq|tx_bad_seq|bad_seq|try_again_later|timed?\s?out|timeout|txtoolate|\b(?:429|50\d)\b|failed to (?:send|submit)|network|fetch/i.test(_msg(e));

/** Bounded poll of one submitted hash; getTransaction blips are swallowed (the tx does not care). */
export async function awaitTx(rpc: Rpc, hash: string, tries = 20, delayMs = 1500): Promise<any> {
  let last: any = null;
  for (let i = 0; i < tries; i++) {
    try {
      last = await rpc.getTransaction(hash);
      if (last?.status && last.status !== "NOT_FOUND") return last;
    } catch {}
    await _sleep(delayMs);
  }
  return last;
}

/**
 * Build (fresh each attempt) + signAndSend. Resolves to the SDK's SentTransaction, or, when the
 * SDK lost the result after a successful submit, to `{ sendTransactionResponse: { hash },
 * getTransactionResponse }` (the same fields every caller reads the hash from).
 */
export async function sendTx(buildAt: () => Promise<any>, attempts = 5, rpc: Rpc = rpcServer, pollDelayMs = 1500): Promise<any> {
  let lastErr: any;
  for (let i = 1; i <= attempts; i++) {
    let hash = "";
    try {
      const at = await buildAt();
      return await at.signAndSend({ watcher: { onSubmitted: (r: any) => { hash = r?.hash || ""; } } });
    } catch (e) {
      lastErr = e;
      if (hash) {
        // Submitted: the ledger owns it now. Find out what happened to THAT tx; never send another.
        const g = await awaitTx(rpc, hash, 20, pollDelayMs);
        if (g?.status === "SUCCESS") return { sendTransactionResponse: { hash }, getTransactionResponse: g };
        if (g?.status === "FAILED") throw e;
        throw new Error(`transaction submitted but not yet confirmed (tx ${hash}); check the explorer before retrying`);
      }
      if (i < attempts && _isTransient(e)) {
        await _sleep(1200 + i * 900);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// SEP-24 withdraw, the half the interactive window does not do: once the anchor reaches
// pending_user_transfer_start the WALLET must pay amount_in of the anchor's asset to
// withdraw_anchor_account with withdraw_memo (typed by withdraw_memo_type). These are the pure
// pieces (parse GET /transaction, build the memo, poll to a status); lib/stellar.ts signs + submits.
import * as Sdk from "@stellar/stellar-sdk";

export type Sep24Tx = {
  id: string;
  status: string;
  message: string;
  moreInfoUrl: string;
  amountIn: string;
  amountOut: string;
  amountFee: string;
  withdrawAnchorAccount: string;
  withdrawMemo: string;
  withdrawMemoType: string;
  /** the Stellar payment the anchor saw (set once it is received) */
  stellarTxId: string;
};

const s = (v: unknown) => (v == null ? "" : String(v));

/** GET {sep24}/transaction body ({ transaction: {...} }) -> Sep24Tx, or null without a status. */
export function parseSep24Tx(json: any): Sep24Tx | null {
  const t = json && (json.transaction || json);
  if (!t || !t.status) return null;
  return {
    id: s(t.id),
    status: s(t.status),
    message: s(t.message),
    moreInfoUrl: s(t.more_info_url),
    amountIn: s(t.amount_in),
    amountOut: s(t.amount_out),
    amountFee: s(t.amount_fee),
    withdrawAnchorAccount: s(t.withdraw_anchor_account),
    withdrawMemo: s(t.withdraw_memo),
    withdrawMemoType: s(t.withdraw_memo_type),
    stellarTxId: s(t.stellar_transaction_id),
  };
}

// SEP-24 end states: nothing the wallet does moves these on.
const TERMINAL = new Set(["completed", "refunded", "error", "expired", "no_market", "too_small", "too_large"]);
export const isTerminal = (status: string) => TERMINAL.has(status);

/** The memo the anchor matches the payment by. SEP-24: `hash` values are base64 (32 bytes). */
export function withdrawMemo(memo: string, type: string): Sdk.Memo {
  if (!memo) return Sdk.Memo.none();
  switch (type || "text") {
    case "text":
      return Sdk.Memo.text(memo);
    case "id":
      return Sdk.Memo.id(memo);
    case "hash": {
      // atob, not Buffer: this runs in the browser too.
      const bin = atob(memo);
      if (bin.length !== 32) throw new Error(`anchor memo of type hash is not 32 bytes of base64 (${bin.length} bytes)`);
      return Sdk.Memo.hash([...bin].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
    }
    default:
      throw new Error(`unsupported withdraw_memo_type "${type}"`);
  }
}

/** Check a pending_user_transfer_start record carries everything the payment needs. */
export function paymentFields(t: Sep24Tx): { destination: string; amount: string; memo: Sdk.Memo } {
  if (t.status !== "pending_user_transfer_start") throw new Error(`anchor is at ${t.status}, not waiting for the payment`);
  if (!Sdk.StrKey.isValidEd25519PublicKey(t.withdrawAnchorAccount)) throw new Error("anchor gave no valid withdraw_anchor_account");
  const n = Number(t.amountIn);
  if (!(n > 0)) throw new Error("anchor gave no amount_in");
  // Classic amounts carry at most 7 decimals; the anchor's string is passed through as-is.
  if (!/^\d+(\.\d{1,7})?$/.test(t.amountIn)) throw new Error(`amount_in "${t.amountIn}" is not a valid Stellar amount`);
  return { destination: t.withdrawAnchorAccount, amount: t.amountIn, memo: withdrawMemo(t.withdrawMemo, t.withdrawMemoType) };
}

/**
 * Poll `read` until `until(tx)` holds or the record goes terminal. Calls `onUpdate` whenever the
 * status changes. Throws on timeout and on abort (signal), so the caller can say which.
 */
export async function pollSep24(
  read: () => Promise<Sep24Tx | null>,
  until: (t: Sep24Tx) => boolean,
  opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal; onUpdate?: (t: Sep24Tx) => void } = {},
): Promise<Sep24Tx> {
  const { intervalMs = 5000, timeoutMs = 15 * 60_000, signal, onUpdate } = opts;
  const end = Date.now() + timeoutMs;
  let last = "";
  for (;;) {
    if (signal?.aborted) throw new Error("cancelled");
    const t = await read().catch(() => null); // a dropped poll is retried, not fatal
    if (t) {
      if (t.status !== last) {
        last = t.status;
        onUpdate?.(t);
      }
      if (until(t) || isTerminal(t.status)) return t;
    }
    if (Date.now() + intervalMs > end) throw new Error(`timed out after ${Math.round(timeoutMs / 60000)} min at ${last || "no status"}`);
    await new Promise<void>((res, rej) => {
      const timer = setTimeout(res, intervalMs);
      signal?.addEventListener("abort", () => (clearTimeout(timer), rej(new Error("cancelled"))), { once: true });
    });
  }
}

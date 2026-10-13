// Client half of fee sponsorship: route the sender's pool writes (deposit + tree registration)
// through /api/sponsor so a wallet with no XLM can still send. Uses lib/stellar's existing
// WalletSigner.submit hook (the one passkey wallets use): the pool client builds the call, this
// rebuilds it with the WALLET as transaction source, simulates, has the wallet sign it once, and
// posts the signed XDR; the server wraps it in a fee bump paid by the sponsor key.
// Privacy: the depositor is still the inner source, exactly as in an unsponsored deposit (deposits
// are public by design); only the fee payer changes.
import * as Sdk from "@stellar/stellar-sdk";
import { PASSPHRASE, DEMO_SECRET } from "@/lib/constants";
import { makeServer } from "@/lib/soroban/rpc";
import { walletSigner, setWalletSigner, type WalletSigner } from "@/lib/stellar";

export type SponsorStatus = { available: true; sponsor: string; balanceXlm: string | null } | { available: false; error: string };
export type Sponsored = { hash: string; sponsor: string; fn: string };
type Post = (body: { xdr: string }) => Promise<{ status: number; body: any }>;

// Below this the wallet may not cover a deposit's fee bid plus its base reserve (a deposit usually
// bids under 0.5 XLM; rent spikes have bid far more), so the sponsor is switched on by default.
// ponytail: fixed threshold; compare against the simulated fee instead if it ever misfires.
export const LOW_XLM = 5;

export async function sponsorStatus(): Promise<SponsorStatus> {
  try {
    const r = await fetch("/api/sponsor", { cache: "no-store" });
    const j = await r.json();
    return r.ok ? j : { available: false, error: j.error || `fee sponsor unavailable (HTTP ${r.status})` };
  } catch {
    return { available: false, error: "fee sponsor unreachable" };
  }
}

/** Spendable-ish XLM of an account (balance), or null when the account does not exist yet. */
export async function xlmBalance(address: string): Promise<number | null> {
  try {
    return Number((await makeServer().getAccountEntry(address)).balance) / 1e7;
  } catch {
    return null;
  }
}

const defaultPost: Post = async (body) => {
  const r = await fetch("/api/sponsor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

/**
 * A WalletSigner.submit: (AssembledTransaction) -> the { sendTransactionResponse: { hash } } shape
 * sendTx expects. Error messages are worded so sendTx never treats a possibly-submitted tx as a
 * transient pre-send fault (no resubmit once the sponsor may have sent it).
 */
export function sponsoredSubmit(address: string, signTransaction: WalletSigner["signTransaction"], onSponsored: (s: Sponsored) => void, post: Post = defaultPost) {
  return async (at: any) => {
    const server = makeServer();
    const op = at.built.operations[0];
    const tx = new Sdk.TransactionBuilder(await server.getAccount(address), { fee: Sdk.BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(Sdk.Operation.invokeHostFunction({ func: op.func, auth: [] }))
      .setTimeout(120)
      .build();
    const prepared = await server.prepareTransaction(tx); // simulate as the wallet; a revert throws here, unsigned
    const signed = await signTransaction(prepared.toXDR(), { networkPassphrase: PASSPHRASE, address });
    const xdr: string = signed?.signedTxXdr || signed;

    let r: { status: number; body: any };
    try {
      r = await post({ xdr });
    } catch {
      throw new Error("the fee sponsor gave no answer; look this deposit up on the explorer before sending again");
    }
    const { status, body } = r;
    if (status === 200 && body.hash) {
      onSponsored({ hash: body.hash, sponsor: body.sponsor, fn: body.fn });
      return { sendTransactionResponse: { hash: body.hash }, getTransactionResponse: { status: "SUCCESS" } };
    }
    if (status === 429) throw new Error("fee sponsor limit reached for now; pay the fee from your wallet instead");
    if (status === 202) throw new Error(`transaction submitted but not yet confirmed (tx ${body.hash}); check the explorer before retrying`);
    throw new Error(body.hash ? `sponsored tx ${body.hash}: ${body.error || body.status}` : body.error || `fee sponsor refused (HTTP ${status})`);
  };
}

/**
 * Install a sponsored signer over the current one (connected wallet, else the built-in testnet key)
 * for the length of one send. Returns the restore function. Passkey wallets already submit through
 * their own fee-paying relayer, so they are left as they are.
 */
export function installSponsoredSigner(onSponsored: (s: Sponsored) => void): () => void {
  const prev = walletSigner();
  if (prev?.submit) return () => {};
  let base: WalletSigner;
  if (prev) base = prev;
  else {
    const kp = Sdk.Keypair.fromSecret(DEMO_SECRET);
    const s = Sdk.contract.basicNodeSigner(kp, PASSPHRASE);
    base = { address: kp.publicKey(), signTransaction: s.signTransaction, signAuthEntry: s.signAuthEntry };
  }
  setWalletSigner({ ...base, submit: sponsoredSubmit(base.address, base.signTransaction, onSponsored) });
  return () => setWalletSigner(prev);
}

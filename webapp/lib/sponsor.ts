// Fee sponsorship (CAP-15 fee-bump) for wallet users with no XLM. The user signs a normal Soroban
// invoke with their own wallet; /api/sponsor wraps it in a FeeBumpTransaction signed by the sponsor
// key, which then pays the whole network fee. The inner source (the depositor) is unchanged.
//
// SECURITY CORE: an open fee-bump endpoint is a fee faucet, so validateInner() refuses everything
// except a signed, testnet, single-op invoke of an allow-listed function on the live pool or the
// USDC SAC, with capped fees. Pure (no network) so the unit test can drive it.
import * as Sdk from "@stellar/stellar-sdk";
import { DEMO_SECRET, POOL, USDC_ISSUER } from "./constants";

export const TESTNET_PASSPHRASE = Sdk.Networks.TESTNET;
export const USDC_SAC = new Sdk.Asset("USDC", USDC_ISSUER).contractId(TESTNET_PASSPHRASE);

// Exactly the writes the sender page signs: pool.deposit + pool.register_root_verified (the deposit,
// then the shielded-tree registration), and SAC approve (the recurring-plan allowance).
export const SPONSOR_ALLOW: Record<string, readonly string[]> = {
  [POOL]: ["deposit", "register_root_verified"],
  [USDC_SAC]: ["approve"],
};

// Caps, in stroops. Inclusion fee: 0.01 XLM per op (surge pricing on testnet is far below this).
// Resource fee: 30 XLM. Real pool deposits on testnet have needed up to ~18.7 XLM of resource fee
// (rent on the growing leaves vector), so a tighter cap would refuse genuine deposits.
// ponytail: fixed caps; per-source daily budget if the sponsor ever funds mainnet.
export const MAX_INCLUSION_FEE = 100_000n;
export const MAX_RESOURCE_FEE = 300_000_000n;

export const SPONSOR_NOT_CONFIGURED = "fee sponsor key not configured (SPONSOR_SECRET)";

/** The sponsor key, or null when unset or when it is the published demo key (never sponsor with that). */
export function sponsorKeypair(env: Record<string, string | undefined> = process.env): Sdk.Keypair | null {
  const s = (env.SPONSOR_SECRET || env.RELAYER_SECRET || "").trim();
  if (!s || s === DEMO_SECRET) return null;
  try {
    return Sdk.Keypair.fromSecret(s);
  } catch {
    return null;
  }
}

export type Validated = {
  ok: true;
  tx: Sdk.Transaction;
  source: string;
  contract: string;
  fn: string;
  inclusionFee: bigint; // per op
  resourceFee: bigint;
};
export type Rejected = { ok: false; reason: string };

export function validateInner(xdr: unknown, networkPassphrase: unknown = TESTNET_PASSPHRASE): Validated | Rejected {
  const no = (reason: string): Rejected => ({ ok: false, reason });
  if (networkPassphrase !== TESTNET_PASSPHRASE) return no("network passphrase must be the Stellar testnet");
  if (typeof xdr !== "string" || !xdr || xdr.length > 20_000) return no("xdr must be a base64 transaction envelope");

  let parsed: Sdk.Transaction | Sdk.FeeBumpTransaction;
  try {
    parsed = Sdk.TransactionBuilder.fromXDR(xdr, TESTNET_PASSPHRASE);
  } catch {
    return no("xdr is not a valid transaction envelope");
  }
  if (parsed instanceof Sdk.FeeBumpTransaction) return no("already a fee-bump transaction");
  const tx = parsed;

  const source = tx.source;
  if (!Sdk.StrKey.isValidEd25519PublicKey(source)) return no("inner source must be a G... account");
  if (tx.operations.length !== 1) return no("exactly one operation is allowed");
  const op = tx.operations[0]!;
  if (op.type !== "invokeHostFunction") return no("operation must be invokeHostFunction");
  if (op.source && op.source !== source) return no("operation source must be the transaction source");

  const func: any = op.func;
  if (func?.type !== "hostFunctionTypeInvokeContract") return no("host function must be a contract call");
  let contract: string;
  let fn: string;
  try {
    contract = Sdk.Address.fromScAddress(func.invokeContract.contractAddress).toString();
    fn = new TextDecoder().decode(func.invokeContract.functionName.bytes);
  } catch {
    return no("could not read the invoked contract / function");
  }
  const allowed = SPONSOR_ALLOW[contract];
  if (!allowed) return no(`contract ${contract} is not sponsorable (only the pool and the USDC SAC)`);
  if (!allowed.includes(fn)) return no(`function "${fn}" is not sponsorable on this contract`);

  const resourceFee = BigInt((tx.toEnvelope() as any).v1?.tx?.ext?.sorobanData?.resourceFee ?? -1);
  if (resourceFee < 0n) return no("missing Soroban resource data (simulate + assemble the transaction first)");
  if (resourceFee > MAX_RESOURCE_FEE) return no(`resource fee ${resourceFee} exceeds the ${MAX_RESOURCE_FEE} stroop cap`);
  const inclusionFee = BigInt(tx.fee) - resourceFee;
  if (inclusionFee < 0n) return no("fee is below the resource fee");
  if (inclusionFee > MAX_INCLUSION_FEE) return no(`inclusion fee ${inclusionFee} exceeds the ${MAX_INCLUSION_FEE} stroop cap`);

  // The inner source must have signed THIS testnet hash. A tx signed for another network hashes
  // differently, so its signature fails here too.
  const kp = Sdk.Keypair.fromPublicKey(source);
  const hint = kp.signatureHint();
  const hash = tx.hash();
  const signed = tx.signatures.some((s: any) => {
    const h: Uint8Array = s.hint?.value ?? s.hint();
    const sig = s.signature?.value ?? s.signature();
    return h.length === 4 && h.every((b, i) => b === hint[i]) && kp.verify(hash, Buffer.from(sig));
  });
  if (!signed) return no("inner transaction is not signed by its source account");

  return { ok: true, tx, source, contract, fn, inclusionFee, resourceFee };
}

/** Wrap a validated inner tx in a fee bump paid by `sponsor`, at the inner's own inclusion rate (min 100). */
export function feeBump(sponsor: Sdk.Keypair, v: Validated): Sdk.FeeBumpTransaction {
  const base = v.inclusionFee > 100n ? v.inclusionFee : 100n;
  const fb = Sdk.TransactionBuilder.buildFeeBumpTransaction(sponsor, base.toString(), v.tx, TESTNET_PASSPHRASE);
  fb.sign(sponsor);
  return fb;
}

// Real yield integration: supply idle USDC to Blend Capital's live testnet lending pool and
// earn supply interest, then withdraw. No mock: every call reaches the live TestnetV2 pool on
// soroban-testnet.stellar.org.
//
//  * READS (readBlend) are server-safe: the Blend SDK loads the pool and the user's position
//    straight off the ledger via its own RPC. An address with no position reads back zero,
//    truthfully. A failed read is returned as { ok:false, reason } (and logged) so the UI can tell
//    "could not read" from "zero balance".
//  * WRITES (blendSupply / blendWithdraw / blendClaim) build the pool op with the Blend SDK's typed
//    PoolContractV2 op-builder, simulate it against the live pool, then sign through the SAME
//    wallet signer WalletProvider installed in lib/stellar (Freighter when connected, else the
//    built-in throwaway demo key) and submit. Signing is NOT reimplemented here.
//
// Deposit is a plain (non-collateral) Supply request: this is idle savings, not borrowing
// collateral. Withdraw removes whichever positions exist: Withdraw for the supply side and
// WithdrawCollateral for any legacy collateralised position from the earlier SupplyCollateral
// version, so both show and both come back out.
import * as Sdk from "@stellar/stellar-sdk";
import { PoolV2, PoolContractV2, RequestType, I128MAX, type Request } from "@blend-capital/blend-sdk";
import { RPC, PASSPHRASE, DEMO_SECRET } from "./constants";
import { server } from "./soroban/rpc";
import { awaitTx } from "./soroban/send";
import { walletSigner, activeAddress } from "./stellar";
import { log, errMsg } from "./log";

// VERIFIED-LIVE testnet addresses (respond on soroban-testnet.stellar.org).
export const BLEND_POOL = "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF";
export const BLEND_USDC = "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU";

const NETWORK = { rpc: RPC, passphrase: PASSPHRASE };
const USDC_DECIMALS = 7;
const STROOPS = 10 ** USDC_DECIMALS;
// Testnet only, but the deposit moves real testnet USDC: never accept a garbage or oversized
// amount. NETWORK is hardcoded to testnet above, so mainnet is unreachable by construction.
const MAX_USDC = 1_000_000;

/** Pool-level facts (no address needed). `poolStatus` is the raw on-chain status code. */
export type BlendPoolInfo = {
  ok: true;
  /** live supply APY of the pool's USDC reserve (weekly-compounded estimate). */
  supplyApy: number;
  /** live supply APR of the pool's USDC reserve. */
  supplyApr: number;
  totalSuppliedUsdc: number;
  /** share of the reserve currently lent out (0.5 == 50%); what is left is withdrawable now. */
  utilization: number;
  poolStatus: number;
  /** true iff the pool accepts supplies (status active or on-ice; frozen/setup reject them). */
  supplyOpen: boolean;
};
export type BlendPosition = BlendPoolInfo & {
  /** non-collateral supply b-tokens (constant as interest accrues; USDC value grows). */
  bTokens: string;
  /** legacy collateralised supply b-tokens (from the earlier SupplyCollateral version). */
  collateralBTokens: string;
  /** current underlying value of both positions in USDC = b-tokens x the live b-rate. */
  valueUsdc: number;
  /** BLND emissions accrued to this supply position and claimable now (0 if none configured). */
  claimableBlnd: number;
  /** reserve token ids carrying claimable emissions (the argument to `claim`). */
  claimTokenIds: number[];
  /** true iff the USDC reserve has a live BLND supply-emission schedule. */
  emissionsActive: boolean;
};
export type BlendReadFail = { ok: false; reason: string };
export type BlendRead = BlendPoolInfo | BlendPosition | BlendReadFail;
export const isPosition = (r: BlendRead): r is BlendPosition => r.ok && "bTokens" in r;
export type BlendWrite = { ok: true; hash: string } | { ok: false; error: string };

// Pool status codes, from the pool contract's require_action_allowed: borrowing is refused above
// status 1, supplying above status 3. Even codes are the admin-set variants of the same state.
export function poolStatusLabel(status: number): string {
  if (status <= 1) return "active";
  if (status <= 3) return "on-ice";
  if (status <= 5) return "frozen";
  return "setup";
}
export const supplyAllowed = (status: number): boolean => status <= 3;

function usdcToStroops(usdc: number): bigint {
  if (!isFinite(usdc) || usdc <= 0) throw new Error("enter a positive USDC amount");
  if (usdc > MAX_USDC) throw new Error(`amount is capped at ${MAX_USDC.toLocaleString()} USDC on this testnet demo`);
  return BigInt(Math.round(usdc * STROOPS));
}

// One pool load per call: metadata + every reserve come back together from PoolV2.load, so the
// reserve, status, and user position below all read from the same snapshot.
async function loadPoolReserve() {
  const pool = await PoolV2.load(NETWORK, BLEND_POOL);
  const reserve = pool.reserves.get(BLEND_USDC);
  if (!reserve) throw new Error("USDC reserve not found in the Blend pool");
  return { pool, reserve };
}

/**
 * Read the pool's live USDC rate + status and, when `address` is given, that address's position:
 * supply + legacy collateral b-tokens, their USDC value (grows as interest accrues), and the BLND
 * emissions claimable on the supply side. An address that never supplied reads back zeros.
 * Returns { ok:false, reason } only when the chain could not be read.
 */
export async function readBlend(address?: string): Promise<BlendRead> {
  try {
    const { pool, reserve } = await loadPoolReserve();
    const info: BlendPoolInfo = {
      ok: true,
      supplyApy: reserve.estSupplyApy,
      supplyApr: reserve.supplyApr,
      totalSuppliedUsdc: reserve.totalSupplyFloat(),
      utilization: reserve.getUtilizationFloat(),
      poolStatus: pool.metadata.status,
      supplyOpen: supplyAllowed(pool.metadata.status),
    };
    if (!address) return info;
    const user = await pool.loadUser(address);
    const em = user.estimateEmissions([reserve]);
    const position: BlendPosition = {
      ...info,
      bTokens: user.getSupplyBTokens(reserve).toString(),
      collateralBTokens: user.getCollateralBTokens(reserve).toString(),
      valueUsdc: user.getSupplyFloat(reserve) + user.getCollateralFloat(reserve),
      claimableBlnd: em.emissions,
      claimTokenIds: em.claimedTokens,
      emissionsActive: !!reserve.supplyEmissions,
    };
    return position;
  } catch (e) {
    const reason = errMsg(e);
    log.error("blend read failed", { pool: BLEND_POOL, address, err: reason });
    return { ok: false, reason };
  }
}

// Wrap one base64 pool operation into a tx, simulate it against the live pool, and return the
// assembled (ready-to-sign) tx. Throws a friendly error carrying the real Blend/token simulation
// error when the pool rejects the request (e.g. the account holds no USDC).
async function buildTx(address: string, opB64: string): Promise<Sdk.Transaction> {
  const op = Sdk.xdr.Operation.fromXDR(opB64, "base64");
  const acct = await server.getAccount(address);
  const tx = new Sdk.TransactionBuilder(acct, { fee: "1000000", networkPassphrase: PASSPHRASE })
    .addOperation(op)
    .setTimeout(120)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Sdk.rpc.Api.isSimulationError(sim)) throw new Error(friendlyBlendError(sim.error));
  return Sdk.rpc.assembleTransaction(tx, sim).build();
}

function buildSubmit(address: string, requests: Request[]): Promise<Sdk.Transaction> {
  return buildTx(address, new PoolContractV2(BLEND_POOL).submit({ from: address, spender: address, to: address, requests }));
}

// Turn a raw Blend/host simulation error into one honest sentence. #13 (and token balance
// traps) surface when the account has no USDC to supply, the most common real case. #1206 is
// InvalidPoolStatus (the pool is frozen or in setup).
function friendlyBlendError(raw: string): string {
  const s = String(raw || "");
  if (/Error\(Contract,\s*#13\)/.test(s) || /balance is not sufficient|insufficient/i.test(s))
    return "Blend rejected the supply: this account has no testnet USDC to lend (fund/trustline USDC first).";
  if (/Error\(Contract,\s*#1206\)/.test(s)) return "Blend pool is not accepting this action in its current status.";
  const code = (s.match(/Error\(Contract,\s*#(\d+)\)/) || [])[1];
  return code ? `Blend pool rejected the request (contract error #${code}).` : "Blend pool rejected the request.";
}

// Sign the assembled tx with the active wallet signer (or the demo key when none), submit, and
// poll to a terminal status. Reuses lib/stellar's wallet signer, no signing reimplemented here.
async function signAndSubmit(tx: Sdk.Transaction, address: string): Promise<string> {
  const w = walletSigner();
  let signed: Sdk.Transaction;
  if (w) {
    const res: any = await w.signTransaction(tx.toXDR(), { networkPassphrase: PASSPHRASE, address });
    const xdr = res?.signedTxXdr ?? res;
    signed = Sdk.TransactionBuilder.fromXDR(xdr, PASSPHRASE) as Sdk.Transaction;
  } else {
    tx.sign(Sdk.Keypair.fromSecret(DEMO_SECRET));
    signed = tx;
  }
  const sent = await server.sendTransaction(signed);
  const hash = sent.hash;
  if (sent.status === "ERROR") throw new Error(`transaction rejected at submission (${sent.errorResult?.toXDR?.("base64") ?? "no result"})`);
  // Same bounded confirmation poll as the pool writes: SUCCESS returns the hash, FAILED throws,
  // and a still-pending transaction names its hash instead of pretending it failed.
  const got = await awaitTx(server, hash);
  if (got?.status === "SUCCESS") return hash;
  throw new Error(got?.status === "FAILED" ? `transaction ${hash} failed on-chain` : `transaction ${hash} not confirmed yet; check the explorer before retrying`);
}

const supplyRequest = (amount: bigint): Request => ({ request_type: RequestType.Supply, address: BLEND_USDC, amount });

/**
 * The withdraw requests for a position: Withdraw for the supply side, WithdrawCollateral for a
 * legacy collateral position, each only when that balance is non-zero. `amount` omitted withdraws
 * everything (I128 max, which Blend caps to the position); a partial amount comes out of the
 * supply side first and falls back to collateral only when there is no supply-side balance.
 */
export function withdrawRequests(supplyBTokens: bigint, collateralBTokens: bigint, amount?: bigint): Request[] {
  const reqs: Request[] = [];
  if (amount !== undefined) {
    const type = supplyBTokens > 0n || collateralBTokens === 0n ? RequestType.Withdraw : RequestType.WithdrawCollateral;
    return [{ request_type: type, address: BLEND_USDC, amount }];
  }
  if (supplyBTokens > 0n) reqs.push({ request_type: RequestType.Withdraw, address: BLEND_USDC, amount: I128MAX });
  if (collateralBTokens > 0n) reqs.push({ request_type: RequestType.WithdrawCollateral, address: BLEND_USDC, amount: I128MAX });
  return reqs;
}

/** Simulate a supply of `usdc` for `address` without signing: proves the tx builds and the pool
 *  accepts it (or returns the real Blend error). Used to check state before asking for a signature. */
export async function simulateBlendSupply(address: string, usdc: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await buildSubmit(address, [supplyRequest(usdcToStroops(usdc))]);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/** Supply `usdc` USDC to the Blend pool (real on-chain deposit, signed by the connected wallet). */
export async function blendSupply(usdc: number): Promise<BlendWrite> {
  try {
    const address = activeAddress();
    const tx = await buildSubmit(address, [supplyRequest(usdcToStroops(usdc))]);
    return { ok: true, hash: await signAndSubmit(tx, address) };
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/** Withdraw from the Blend pool. `usdc` omitted (or <= 0) withdraws the FULL position, supply side
 *  and any legacy collateral side. Reads the live position first so only existing sides are
 *  requested. Real on-chain withdraw, signed by the connected wallet. */
export async function blendWithdraw(usdc?: number): Promise<BlendWrite> {
  try {
    const address = activeAddress();
    const { pool, reserve } = await loadPoolReserve();
    const user = await pool.loadUser(address);
    const requests = withdrawRequests(user.getSupplyBTokens(reserve), user.getCollateralBTokens(reserve), usdc && usdc > 0 ? usdcToStroops(usdc) : undefined);
    if (requests.length === 0) throw new Error("nothing to withdraw: this account holds no Blend position");
    const tx = await buildSubmit(address, requests);
    return { ok: true, hash: await signAndSubmit(tx, address) };
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/** Claim the BLND emissions accrued to `reserveTokenIds` (from `readBlend().claimTokenIds`; the USDC
 *  supply side is reserve index * 2 + 1). Real on-chain claim, signed by the connected wallet. */
export async function blendClaim(reserveTokenIds: number[]): Promise<BlendWrite> {
  try {
    if (reserveTokenIds.length === 0) throw new Error("no claimable BLND on this position");
    const address = activeAddress();
    const tx = await buildTx(address, new PoolContractV2(BLEND_POOL).claim({ from: address, reserve_token_ids: reserveTokenIds, to: address }));
    return { ok: true, hash: await signAndSubmit(tx, address) };
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

// ponytail: self-check. `usdcToStroops` is the money-path conversion + guard. Run with a
// ts-runner; no framework. Verifies scaling and the reject cases.
export function demo() {
  console.assert(usdcToStroops(10) === 100000000n, "10 USDC => 1e8 stroops");
  console.assert(usdcToStroops(0.0000001) === 1n, "1 stroop rounds correctly");
  for (const bad of [0, -5, NaN, Infinity, MAX_USDC + 1]) {
    let threw = false;
    try {
      usdcToStroops(bad);
    } catch {
      threw = true;
    }
    console.assert(threw, `should reject ${bad}`);
  }
  console.log("blend demo ok");
}

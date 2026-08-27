// Real yield integration: supply idle USDC to Blend Capital's live testnet lending pool and
// earn supply interest, then withdraw. No mock — every call reaches the live TestnetV2 pool on
// soroban-testnet.stellar.org.
//
//  * READS (readBlendPosition / readBlendRate) are server-safe: the Blend SDK loads the pool and
//    the user's position straight off the ledger via its own RPC. An address with no position
//    reads back zero, truthfully.
//  * WRITES (blendSupply / blendWithdraw) build the pool's `submit` op with the Blend SDK's typed
//    PoolContractV2 op-builder, simulate it against the live pool, then sign through the SAME
//    wallet signer WalletProvider installed in lib/stellar (Freighter when connected, else the
//    built-in throwaway demo key) and submit. Signing is NOT reimplemented here.
//
// Deposit is a SupplyCollateral request; withdraw is the matching WithdrawCollateral request
// (Blend keeps a collateralised supply as a `collateral` position, so it must be removed with
// WithdrawCollateral). readBlendPosition sums the supply + collateral b-tokens so the figure is
// right whichever way tokens were supplied.
import * as Sdk from "@stellar/stellar-sdk";
import { PoolV2, PoolContractV2, RequestType, I128MAX } from "@blend-capital/blend-sdk";
import { RPC, PASSPHRASE, DEMO_SECRET } from "./constants";
import { server } from "./soroban/rpc";
import { walletSigner, activeAddress } from "./stellar";

// VERIFIED-LIVE testnet addresses (respond on soroban-testnet.stellar.org).
export const BLEND_POOL = "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF";
export const BLEND_USDC = "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU";

const NETWORK = { rpc: RPC, passphrase: PASSPHRASE };
const USDC_DECIMALS = 7;
const STROOPS = 10 ** USDC_DECIMALS;
// Testnet only, but the deposit moves real testnet USDC — never accept a garbage or oversized
// amount. NETWORK is hardcoded to testnet above, so mainnet is unreachable by construction.
const MAX_USDC = 1_000_000;

export type BlendPosition = {
  /** b-token balance (constant as interest accrues; its USDC value grows). */
  bTokens: string;
  /** current underlying value of the position in USDC = b-tokens × the live b-rate (accrues). */
  valueUsdc: number;
  /** live supply APY of the pool's USDC reserve (weekly-compounded estimate). */
  supplyApy: number;
  /** live supply APR of the pool's USDC reserve. */
  supplyApr: number;
};

export type BlendRate = { supplyApy: number; supplyApr: number; totalSuppliedUsdc: number };
export type BlendWrite = { ok: true; hash: string } | { ok: false; error: string };

function usdcToStroops(usdc: number): bigint {
  if (!isFinite(usdc) || usdc <= 0) throw new Error("enter a positive USDC amount");
  if (usdc > MAX_USDC) throw new Error(`amount is capped at ${MAX_USDC.toLocaleString()} USDC on this testnet demo`);
  return BigInt(Math.round(usdc * STROOPS));
}

/** Live USDC supply rate + total pool supply, for the not-connected state (no address needed). */
export async function readBlendRate(): Promise<BlendRate | null> {
  try {
    const pool = await PoolV2.load(NETWORK, BLEND_POOL);
    const reserve = pool.reserves.get(BLEND_USDC);
    if (!reserve) return null;
    return { supplyApy: reserve.estSupplyApy, supplyApr: reserve.supplyApr, totalSuppliedUsdc: reserve.totalSupplyFloat() };
  } catch {
    return null;
  }
}

/**
 * Read `address`'s live USDC position in the Blend pool: current underlying value (b-tokens ×
 * the pool's b-rate, which grows as interest accrues) plus the live supply APY/APR. An address
 * that never supplied reads back zeros. Returns null only when the chain could not be read.
 */
export async function readBlendPosition(address: string): Promise<BlendPosition | null> {
  try {
    const pool = await PoolV2.load(NETWORK, BLEND_POOL);
    const reserve = pool.reserves.get(BLEND_USDC);
    if (!reserve) return null;
    const user = await pool.loadUser(address);
    const bTokens = user.getSupplyBTokens(reserve) + user.getCollateralBTokens(reserve);
    const valueUsdc = user.getSupplyFloat(reserve) + user.getCollateralFloat(reserve);
    return { bTokens: bTokens.toString(), valueUsdc, supplyApy: reserve.estSupplyApy, supplyApr: reserve.supplyApr };
  } catch {
    return null;
  }
}

// Build the pool `submit` transaction for one request, simulate it against the live pool, and
// return the assembled (ready-to-sign) tx. Throws a friendly error carrying the real Blend/token
// simulation error when the pool rejects the request (e.g. the account holds no USDC).
async function buildSubmit(address: string, requestType: RequestType, amount: bigint): Promise<Sdk.Transaction> {
  const opB64 = new PoolContractV2(BLEND_POOL).submit({
    from: address,
    spender: address,
    to: address,
    requests: [{ request_type: requestType, address: BLEND_USDC, amount }],
  });
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

// Turn a raw Blend/host simulation error into one honest sentence. #13 (and token balance
// traps) surface when the account has no USDC to supply — the most common real case.
function friendlyBlendError(raw: string): string {
  const s = String(raw || "");
  if (/Error\(Contract,\s*#13\)/.test(s) || /balance is not sufficient|insufficient/i.test(s))
    return "Blend rejected the supply: this account has no testnet USDC to lend (fund/trustline USDC first).";
  const code = (s.match(/Error\(Contract,\s*#(\d+)\)/) || [])[1];
  return code ? `Blend pool rejected the request (contract error #${code}).` : "Blend pool rejected the request.";
}

// Sign the assembled tx with the active wallet signer (or the demo key when none), submit, and
// poll to a terminal status. Reuses lib/stellar's wallet signer — no signing reimplemented here.
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
  let status: string = sent.status;
  const hash = sent.hash;
  for (let i = 0; i < 20 && (status === "PENDING" || status === "NOT_FOUND" || status === "TRY_AGAIN_LATER"); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      status = (await server.getTransaction(hash)).status as any;
    } catch {}
  }
  if (status !== "SUCCESS") throw new Error(`transaction ${status}`);
  return hash;
}

/** Simulate a supply of `usdc` for `address` without signing — proves the tx builds and the pool
 *  accepts it (or returns the real Blend error). Used to check state before asking for a signature. */
export async function simulateBlendSupply(address: string, usdc: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await buildSubmit(address, RequestType.SupplyCollateral, usdcToStroops(usdc));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/** Supply `usdc` USDC to the Blend pool (real on-chain deposit, signed by the connected wallet). */
export async function blendSupply(usdc: number): Promise<BlendWrite> {
  try {
    const address = activeAddress();
    const tx = await buildSubmit(address, RequestType.SupplyCollateral, usdcToStroops(usdc));
    return { ok: true, hash: await signAndSubmit(tx, address) };
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/** Withdraw from the Blend pool. `usdc` omitted (or <= 0) withdraws the FULL position (I128 max,
 *  which Blend caps to the position). Real on-chain withdraw, signed by the connected wallet. */
export async function blendWithdraw(usdc?: number): Promise<BlendWrite> {
  try {
    const address = activeAddress();
    const amount = usdc && usdc > 0 ? usdcToStroops(usdc) : I128MAX;
    const tx = await buildSubmit(address, RequestType.WithdrawCollateral, amount);
    return { ok: true, hash: await signAndSubmit(tx, address) };
  } catch (e: any) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

// ponytail: self-check — `usdcToStroops` is the money-path conversion + guard. Run with a
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

// Tukar — live Stellar testnet from the browser (Next.js port of frontend/stellar.js).
// FAITHFUL PORT: same exported names/signatures, same RPC/network/logic, same error
// handling — so it stays live-verified against the deployed pool. Only difference vs the
// vanilla site: @stellar/stellar-sdk + snarkjs + js-sha3 come from npm (dynamic-imported
// where they touch Node/browser builtins) instead of the CDN, and circuit assets are
// fetched from /circuit/* (Next public dir) instead of ./circuit/*.
//
//  * reads (balance, verify) are read-only RPC simulations — no key needed;
//  * deposit() is a real signed write. It uses a THROWAWAY testnet demo key
//    (non-admin, holds only free testnet XLM) embedded below so anyone can try
//    the demo without a wallet. Never reuse this pattern for real funds.
import * as Sdk from "@stellar/stellar-sdk";
import { keccak256 } from "js-sha3";
import { RPC, PASSPHRASE, FIELD_R, DEMO_SECRET, SOURCE, POOL, DISCLOSURE_VERIFIER, THRESHOLD_VERIFIER, AGGREGATE_VERIFIER, RANGE_VERIFIER, REFLECTOR_FX, ANCHOR, ONRAMPER } from "./constants";

// Re-export the public contract-ID / config constants so route code can import them from
// lib/stellar (their original home) OR lib/constants (a light, SDK-free bundle).
export { POOL, DISCLOSURE_VERIFIER, THRESHOLD_VERIFIER, AGGREGATE_VERIFIER, RANGE_VERIFIER, REFLECTOR_FX, ANCHOR, ONRAMPER, RPC, PASSPHRASE } from "./constants";

// snarkjs is dynamic-imported (browser-only, heavy) so it never lands in a server bundle.
let _snarkjs: any = null;
async function snarkjs(): Promise<any> {
  if (!_snarkjs) _snarkjs = await import("snarkjs");
  return _snarkjs;
}

const server = new Sdk.rpc.Server(RPC);

type SimResult = { ok: false; error: unknown } | { ok: true; value: any };

async function simulate(contractId: string, method: string, ...args: any[]): Promise<SimResult> {
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

// Reflector's oracle decimals (queried once, cached). The FX feed reports prices
// scaled by 10^decimals; we read it rather than hardcode so a feed change can't
// silently 1000x the off-ramp number.
let _fxDecimals: number | null = null;
/**
 * Read a live USD->local FX rate from the Reflector SEP-40 oracle (on-chain).
 * `symbol` is the quote currency code (e.g. "MXN"); the oracle's base is USD.
 * Reflector returns the USD price of 1 local unit, so the USD->local rate is
 * its reciprocal. Returns { rate, timestamp } (local units per 1 USD), or null
 * if the feed doesn't carry this currency / the read fails.
 */
export async function readReflectorFx(symbol: string): Promise<{ rate: number; timestamp: number } | null> {
  try {
    if (_fxDecimals === null) {
      const d = await simulate(REFLECTOR_FX, "decimals");
      _fxDecimals = d.ok ? Number(d.value) : 14;
    }
    // Reflector's Asset is `enum { Stellar(Address), Other(Symbol) }`; the fiat
    // feeds use the Other(Symbol) variant, encoded as a 2-element vec ScVal.
    const asset = Sdk.xdr.ScVal.scvVec([
      Sdk.xdr.ScVal.scvSymbol("Other"),
      Sdk.xdr.ScVal.scvSymbol(symbol),
    ]);
    const res = await simulate(REFLECTOR_FX, "lastprice", asset);
    if (!res.ok || !res.value || res.value.price === undefined) return null;
    const price = BigInt(res.value.price); // USD value of 1 local unit, scaled 10^dec
    if (price <= 0n) return null;
    // Staleness gate: don't present a frozen oracle price as a live rate. If the
    // feed hasn't updated in over an hour, return null so the caller falls back to
    // the HTTP FX API rather than mislabeling a stale number "live · on-chain".
    const ts = Number(res.value.timestamp);
    if (ts > 0 && Date.now() / 1000 - ts > 3600) return null;
    const scale = 10n ** BigInt(_fxDecimals);
    const rate = Number(scale) / Number(price); // local units per 1 USD
    // Plausibility bound: a dust/garbage price would make the reciprocal explode and
    // 1000x the off-ramp figure. No real fiat trades above ~1e7 per USD; reject out-of-band.
    if (!isFinite(rate) || rate <= 0 || rate > 1e7) return null;
    return { rate, timestamp: ts };
  } catch (_) {
    return null;
  }
}

/**
 * Read the last `records` raw Reflector price records for a symbol (newest first) so the
 * UI can SHOW the depth behind the median settlement basis — the actual N data points and
 * how fresh each is — instead of a single opaque number. Returns
 * { records: [{ rate, ageSec }], decimals } (rate = local units per 1 USD), or null.
 */
export async function readReflectorRecords(
  symbol: string,
  records = 5,
): Promise<{ records: { rate: number; ageSec: number | null }[]; decimals: number } | null> {
  try {
    if (_fxDecimals === null) {
      const d = await simulate(REFLECTOR_FX, "decimals");
      _fxDecimals = d.ok ? Number(d.value) : 14;
    }
    const asset = Sdk.xdr.ScVal.scvVec([
      Sdk.xdr.ScVal.scvSymbol("Other"),
      Sdk.xdr.ScVal.scvSymbol(symbol),
    ]);
    const res = await simulate(REFLECTOR_FX, "prices", asset, Sdk.nativeToScVal(records, { type: "u32" }));
    if (!res.ok || !Array.isArray(res.value) || res.value.length === 0) return null;
    const scale = 10n ** BigInt(_fxDecimals);
    const now = Date.now() / 1000;
    const out: { rate: number; ageSec: number | null }[] = [];
    for (const r of res.value) {
      const price = BigInt(r.price);
      if (price <= 0n) continue;
      const ts = Number(r.timestamp);
      out.push({ rate: Number(scale) / Number(price), ageSec: ts > 0 ? Math.max(0, Math.round(now - ts)) : null });
    }
    return out.length ? { records: out, decimals: _fxDecimals } : null;
  } catch (_) {
    return null;
  }
}

/**
 * Off-ramp quote computed ON-CHAIN by the pool: it cross-contract-reads the
 * Reflector oracle and returns the local fiat for `usdcAmount` (whole USDC) at the
 * live rate. This is contract-to-contract composability — the receiver's revealed
 * figure is derived by our Soroban contract reading Reflector, not a client math.
 * Returns the local amount (Number) or null if the feed doesn't carry the symbol.
 */
export async function offrampQuote(symbol: string, usdcAmount: number): Promise<number | null> {
  const res = await simulate(
    POOL,
    "offramp_quote",
    Sdk.xdr.ScVal.scvSymbol(symbol),
    Sdk.nativeToScVal(BigInt(Math.max(0, Math.round(usdcAmount))), { type: "i128" }),
  );
  if (!res.ok || res.value == null) return null;
  const n = Number(res.value);
  return isFinite(n) && n >= 0 ? n : null;
}

/**
 * Manipulation-resistant off-ramp quote: priced at the MEDIAN of the last `records`
 * Reflector records — the exact basis the withdraw settlement gate enforces. Used to
 * compute the min-receive floor so the client's floor and the on-chain gate agree
 * (rather than deriving the floor from a spot price that could diverge from the median).
 * Returns the local amount (Number) or null if the feed is too thin / unavailable.
 */
export async function offrampQuoteTwap(symbol: string, usdcAmount: number, records = 5): Promise<number | null> {
  const res = await simulate(
    POOL,
    "offramp_quote_twap",
    Sdk.xdr.ScVal.scvSymbol(symbol),
    Sdk.nativeToScVal(BigInt(Math.max(0, Math.round(usdcAmount))), { type: "i128" }),
    Sdk.nativeToScVal(records, { type: "u32" }),
  );
  if (!res.ok || res.value == null) return null;
  const n = Number(res.value);
  return isFinite(n) && n >= 0 ? n : null;
}

/** Read the LIVE ASP allow-list root from the pool (the on-chain compliance policy,
 *  not a frontend constant) so "trustless compliance" is independently verifiable — a
 *  judge can compare this to asp_root() on stellar.expert. Returns a 64-char hex, or null. */
export async function readAspRoot(): Promise<string | null> {
  const res = await simulate(POOL, "asp_root");
  if (!res.ok || !res.value) return null;
  try {
    const u = res.value instanceof Uint8Array ? res.value : Uint8Array.from(res.value);
    return [...u].map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Read the pool's LIVE deny-list (the block-list "policy registry") so the compliance
 * proof's non-membership public inputs are built from the CURRENT on-chain policy —
 * honoring an admin `set_deny_list` without shipping a new frontend. Returns an array
 * of decimal field-element strings (each 32-byte BytesN read big-endian), or null on
 * any read failure (caller falls back to the witness snapshot).
 */
export async function readDenyList(): Promise<string[] | null> {
  const res = await simulate(POOL, "deny_list");
  if (!res.ok || !Array.isArray(res.value)) return null;
  try {
    return res.value.map((b: any) => {
      const u = b instanceof Uint8Array ? b : Uint8Array.from(b);
      let n = 0n;
      for (const x of u) n = (n << 8n) | BigInt(x);
      return n.toString();
    });
  } catch {
    return null;
  }
}

/** Read the pool's live custody balance + commitment count from chain. */
export async function readPoolState(): Promise<{ balance: string; commitments: string }> {
  const [bal, count] = await Promise.all([simulate(POOL, "balance"), simulate(POOL, "commitment_count")]);
  return {
    balance: bal.ok ? bal.value.toString() : "?",
    commitments: count.ok ? count.value.toString() : "?",
  };
}

/**
 * Recent corridor activity from on-chain events via RPC getEvents — the indexing
 * tier. The pool emits deposit/withdraw/transfer/root events; this reads them back so
 * the console can show a live feed sourced from chain, not local state. Testnet public
 * RPC ages events out (~latest-10k ledgers), so this is a RECENT view, not a source of
 * truth. Returns [] on any error (feed is best-effort).
 */
export async function readRecentActivity(
  maxEvents = 10,
): Promise<{ kind: string; ledger: number; txHash: string }[]> {
  try {
    const latest = await server.getLatestLedger();
    const startLedger = Math.max(1, latest.sequence - 9000); // ~half a day at ~5s/ledger
    const res = await server.getEvents({
      startLedger,
      filters: [{ type: "contract", contractIds: [POOL] }],
      limit: 100,
    });
    const toNative = (x: any) => {
      try {
        const sc = typeof x === "string" ? Sdk.xdr.ScVal.fromXDR(x, "base64") : x;
        return Sdk.scValToNative(sc);
      } catch (_) {
        return null;
      }
    };
    return (res.events || [])
      .map((ev: any) => ({
        kind: String(ev.topic && ev.topic[0] != null ? toNative(ev.topic[0]) : "?"), // deposit|withdraw|transfer|root
        ledger: ev.ledger,
        txHash: ev.txHash,
      }))
      .slice(-maxEvents)
      .reverse(); // newest first
  } catch (_) {
    return [];
  }
}

const bytesToBig = (u8: Iterable<number>): bigint => {
  let x = 0n;
  for (const b of u8) x = (x << 8n) | BigInt(b);
  return x;
};

/** The pool's current Merkle root, as a BigInt (or null on error). */
export async function readCurrentRoot(): Promise<bigint | null> {
  const r = await simulate(POOL, "current_root");
  if (!r.ok || !r.value) return null;
  try {
    return bytesToBig(r.value);
  } catch (_) {
    return null;
  }
}

/**
 * The ordered Merkle-tree leaves (deposited commitments), read from the pool's
 * DURABLE on-chain state via `leaves()`. Unlike event reconstruction this does
 * NOT depend on RPC event retention, so the browser tree always mirrors the real
 * on-chain tree — reload-safe and correct even when other users have deposited.
 * Returns BigInt[] in tree order (or [] on error).
 */
export async function loadLeavesFromChain(): Promise<bigint[]> {
  const cnt = await simulate(POOL, "leaf_count");
  if (!cnt.ok) return [];
  const n = Number(cnt.value);
  const out: bigint[] = [];
  const CHUNK = 64; // paginate so this scales past a single read budget
  const u32 = (x: number) => Sdk.nativeToScVal(x, { type: "u32" });
  for (let start = 0; start < n; start += CHUNK) {
    const r = await simulate(POOL, "leaf_range", u32(start), u32(CHUNK));
    if (!r.ok || !Array.isArray(r.value)) return [];
    for (const b of r.value) out.push(bytesToBig(b));
  }
  return out;
}

// ---- snarkjs proof -> contract args (G2 uses Soroban c1||c0 ordering) ----
const fe = (d: string | bigint): string => BigInt(d).toString(16).padStart(64, "0");
const g1 = (pt: any): string => fe(pt[0]) + fe(pt[1]);
const g2 = (pt: any): string => fe(pt[0][1]) + fe(pt[0][0]) + fe(pt[1][1]) + fe(pt[1][0]);
const buf = (hex: string): Uint8Array => Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
const buf32 = (dec: string | bigint): Uint8Array => buf(BigInt(dec).toString(16).padStart(64, "0"));

export type Groth16Proof = { pi_a: any; pi_b: any; pi_c: any; [k: string]: any };
export type VerifyResult = { verified: boolean; error?: string };

// Verify a Groth16 proof ON-CHAIN against any deployed circom-groth16 verifier by
// simulating verify(proof, public_inputs). Read-only: an invalid proof traps in
// simulation, which is a (correct) rejection.
const _clients: Record<string, any> = {};
async function verifierClient(contractId: string): Promise<any> {
  if (!_clients[contractId]) {
    _clients[contractId] = await Sdk.contract.Client.from({ contractId, networkPassphrase: PASSPHRASE, rpcUrl: RPC });
  }
  return _clients[contractId];
}
async function verifyOnChain(contractId: string, proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  try {
    const client = await verifierClient(contractId);
    const at = await client.verify({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      public_inputs: publicSignals.map((s) => BigInt(s)),
    });
    const r = at.result;
    const ok = r === true || r?.value === true || r?.tag === "Ok";
    return ok ? { verified: true } : { verified: false, error: "verifier returned false" };
  } catch (e: any) {
    return { verified: false, error: (e && e.message) || String(e) };
  }
}

export function verifyDisclosureOnChain(proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  return verifyOnChain(DISCLOSURE_VERIFIER, proof, publicSignals);
}
export function verifyThresholdOnChain(proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  return verifyOnChain(THRESHOLD_VERIFIER, proof, publicSignals);
}
/** Generic BN254 on-chain verify against any verifier contract — used to re-verify an
 *  exported audit receipt of any disclosure type (exact/threshold/aggregate/range). */
export function verifyProofOnChain(verifierId: string, proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  return verifyOnChain(verifierId, proof, publicSignals);
}

/**
 * Threshold (range) disclosure verified THROUGH THE POOL, not the bare verifier: the
 * pool's `disclose_threshold` checks the commitment is a KNOWN on-chain deposit before
 * verifying the range proof — so the regulator's "amount <= threshold" attestation is
 * bound to a real pool commitment, not a free-floating proof. Read-only simulation.
 * publicSignals order is [commitment, threshold, auditContextHash].
 */
export async function discloseThresholdViaPool(proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  try {
    const client = await verifierClient(POOL);
    const at = await client.disclose_threshold({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      commitment: buf32(publicSignals[0]),
      threshold: buf32(publicSignals[1]),
      audit_context: buf32(publicSignals[2]),
    });
    const r = at.result;
    const ok = r === true || r?.value === true || r?.tag === "Ok";
    return ok ? { verified: true } : { verified: false, error: "pool returned false" };
  } catch (e: any) {
    return { verified: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Aggregate (portfolio) disclosure verified THROUGH THE POOL: `disclose_aggregate` checks
 * EVERY commitment in the sum is a known on-chain deposit before verifying the proof, so
 * "total <= cap" is bound to real deposits. Read-only simulation.
 * publicSignals order is [commitments(5), active(5), cap, auditContextHash, ctxNonce].
 */
export async function discloseAggregateViaPool(proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  try {
    const client = await verifierClient(POOL);
    const at = await client.disclose_aggregate({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      commitments: [0, 1, 2, 3, 4].map((i) => buf32(publicSignals[i])),
      active: [5, 6, 7, 8, 9].map((i) => Number(publicSignals[i])),
      cap: buf32(publicSignals[10]),
      audit_context: buf32(publicSignals[11]),
      ctx_nonce: buf32(publicSignals[12]),
    });
    const r = at.result;
    const ok = r === true || r?.value === true || r?.tag === "Ok";
    return ok ? { verified: true } : { verified: false, error: "pool returned false" };
  } catch (e: any) {
    return { verified: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Register an aggregate AUDIT REQUEST on-chain (auditor-signed): stores the audit hash
 * Poseidon(ctxNonce, commitments, active) the regulator issued for the FULL required set.
 * disclose_aggregate then only accepts a proof whose auditContextHash is registered, so a
 * holder can't mint their own hash for a cherry-picked subset — completeness ON-CHAIN.
 * Returns { ok, hash } or { ok:false, error }.
 */
export async function registerAuditRequest(auditContextHash: string | bigint): Promise<{ ok: boolean; hash?: string; error?: string }> {
  try {
    const client = await poolWriteClient();
    const res = await sendTx(() => client.register_audit_request({ audit_context_hash: buf32(auditContextHash) }));
    const hash = res?.sendTransactionResponse?.hash || res?.getTransactionResponse?.txHash || "";
    return { ok: true, hash };
  } catch (e) {
    return { ok: false, error: friendlyPoolError(e) };
  }
}

/**
 * Two-sided range (band) disclosure verified THROUGH THE POOL: disclose_range checks the
 * commitment is a known on-chain deposit, then verifies lower <= amount <= upper. Read-only
 * simulation. publicSignals order is [commitment, lower, upper, auditContextHash].
 */
export async function discloseRangeViaPool(proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  try {
    const client = await verifierClient(POOL);
    const at = await client.disclose_range({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      commitment: buf32(publicSignals[0]),
      lower: buf32(publicSignals[1]),
      upper: buf32(publicSignals[2]),
      audit_context: buf32(publicSignals[3]),
    });
    const r = at.result;
    const ok = r === true || r?.value === true || r?.tag === "Ok";
    return ok ? { verified: true } : { verified: false, error: "pool returned false" };
  } catch (e: any) {
    return { verified: false, error: (e && e.message) || String(e) };
  }
}

let _asp: any;
async function aspWitness(): Promise<any> {
  // ?v bumped whenever the allow/deny policy changes (mirrors mutable on-chain policy),
  // so a returning browser never builds compliance inputs from a stale witness.
  if (!_asp) _asp = await (await fetch("/circuit/asp-witness.json?v=3")).json();
  return _asp;
}

// Optional external wallet (Freighter). When set, deposits/withdraws are signed
// by the user's own wallet instead of the embedded demo key. Falls back to the
// demo key when null, so the no-install demo always works.
export type WalletSigner = {
  address: string;
  signTransaction: (xdr: string, opts?: any) => Promise<any>;
  signAuthEntry: (xdr: string, opts?: any) => Promise<any>;
};
let _wallet: WalletSigner | null = null; // { address, signTransaction, signAuthEntry }
export function setWalletSigner(w: WalletSigner | null): void {
  _wallet = w;
  _poolWrite = null;
}
export function activeAddress(): string {
  return _wallet ? _wallet.address : DEMO_ADDRESS;
}
export function usingWallet(): boolean {
  return !!_wallet;
}

// ---- SEP anchor on-ramp (REAL, no mock) ----
// ANCHOR config (imported from ./constants) = the fiat on/off-ramp's SEP home. Swapping
// that one object to a licensed anchor is the entire change to go live — the SEP-10/24
// flow below is byte-for-byte identical. See docs/ANCHOR.md.
// SEP-1 discovery + SEP-10 web-auth against the anchor: returns an authenticated bearer
// JWT + the SEP-24 transfer server. Shared by the on-ramp (deposit) and off-ramp (withdraw).
async function anchorAuth(): Promise<{ bearer: { Authorization: string }; SEP24: string; address: string }> {
  const address = activeAddress();
  const toml = await (await fetch(`${ANCHOR.base}/.well-known/stellar.toml`)).text();
  const grab = (k: string) => (toml.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, "m")) || [])[1];
  const WEB_AUTH = grab("WEB_AUTH_ENDPOINT"),
    SEP24 = grab("TRANSFER_SERVER_SEP0024");
  if (!WEB_AUTH || !SEP24) throw new Error("anchor stellar.toml is missing endpoints");
  const chal = await (await fetch(`${WEB_AUTH}?account=${address}&home_domain=${ANCHOR.home}`)).json();
  if (!chal.transaction) throw new Error("SEP-10 challenge failed: " + (chal.error || "no transaction"));
  const netPass = chal.network_passphrase || PASSPHRASE;
  let signedXdr: string;
  if (_wallet && _wallet.signTransaction) {
    const res = await _wallet.signTransaction(chal.transaction, { networkPassphrase: netPass, address });
    signedXdr = res.signedTxXdr || res;
  } else {
    const tx = new Sdk.Transaction(chal.transaction, netPass);
    tx.sign(Sdk.Keypair.fromSecret(DEMO_SECRET));
    signedXdr = tx.toXDR();
  }
  const jwtRes = await (
    await fetch(WEB_AUTH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: signedXdr }),
    })
  ).json();
  if (!jwtRes.token) throw new Error("SEP-10 auth failed: " + (jwtRes.error || "no token"));
  return { bearer: { Authorization: `Bearer ${jwtRes.token}` }, SEP24, address };
}

export type AnchorSession = { url: string; id: string; asset: string; address: string; sep24: string; bearer: { Authorization: string } };

export async function anchorOnramp(): Promise<AnchorSession> {
  const { bearer, SEP24, address } = await anchorAuth();
  const info = await (await fetch(`${SEP24}/info`, { headers: bearer })).json();
  const assets = Object.keys(info.deposit || {});
  const asset = assets.includes("USDC") ? "USDC" : assets[0] || "USDC";
  const intr = await (
    await fetch(`${SEP24}/transactions/deposit/interactive`, {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ asset_code: asset, account: address }),
    })
  ).json();
  if (!intr.url) throw new Error("SEP-24 interactive deposit failed: " + (intr.error || "no url"));
  return { url: intr.url, id: intr.id, asset, address, sep24: SEP24, bearer };
}

// Onramper (imported from ./constants) — a licensed off-ramp AGGREGATOR (routes to
// MoonPay / Transak / Alchemy Pay). The key is Onramper's PUBLIC docs key (fine for demo).
/**
 * Live off-ramp SELL quote from Onramper's licensed providers: sell `usdc` (USDC on Stellar)
 * for `fiat`. Returns the best real quote { payout, rate, fee, ramp } or null.
 */
export async function onramperQuote(
  usdc: number,
  fiat: string,
): Promise<{ payout: number; rate: number; fee: number; ramp: string } | null> {
  try {
    const amt = Math.max(1, Math.floor(Number(usdc) || 0));
    const r = await fetch(`${ONRAMPER.api}/quotes/usdc_stellar/${String(fiat).toLowerCase()}?amount=${amt}&type=sell`, {
      headers: { Authorization: ONRAMPER.apiKey },
    });
    const arr = await r.json();
    if (!Array.isArray(arr)) return null;
    const best = arr
      .filter((q: any) => q && typeof q.payout === "number" && q.payout > 0 && (!q.errors || q.errors.length === 0))
      .sort((a: any, b: any) => b.payout - a.payout)[0];
    return best ? { payout: best.payout, rate: best.rate, fee: best.transactionFee, ramp: best.ramp || "a licensed provider" } : null;
  } catch (_) {
    return null;
  }
}

/** Build the Onramper hosted SELL (off-ramp) widget URL for USDC-on-Stellar -> `fiat`. */
export function onramperOfframpUrl(usdc: number, fiat: string): string {
  const amt = Math.max(1, Math.floor(Number(usdc) || 0));
  const p = new URLSearchParams({
    apiKey: ONRAMPER.apiKey,
    mode: "sell",
    sell_defaultCrypto: "USDC",
    sell_onlyCryptoNetworks: "stellar",
    sell_defaultFiat: String(fiat).toUpperCase(),
    sell_defaultAmount: String(amt),
  });
  return `${ONRAMPER.widget}/?${p.toString()}`;
}

/**
 * REAL off-ramp (SEP-24 WITHDRAW): the exact protocol call a corridor uses to turn USDC
 * into local fiat at the RECEIVING edge — same SEP-10 auth, then a genuine hosted
 * withdraw session. Against SDF's reference anchor on testnet (no KYC). Returns
 * { url, id, asset, address, sep24, bearer }.
 */
export async function anchorOfframp(): Promise<AnchorSession> {
  const { bearer, SEP24, address } = await anchorAuth();
  const info = await (await fetch(`${SEP24}/info`, { headers: bearer })).json();
  const assets = Object.keys(info.withdraw || {});
  const asset = assets.includes("USDC") ? "USDC" : assets[0] || "USDC";
  const intr = await (
    await fetch(`${SEP24}/transactions/withdraw/interactive`, {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ asset_code: asset, account: address }),
    })
  ).json();
  if (!intr.url) throw new Error("SEP-24 interactive withdraw failed: " + (intr.error || "no url"));
  return { url: intr.url, id: intr.id, asset, address, sep24: SEP24, bearer };
}

/**
 * Poll a SEP-24 transaction's status (the anchor's real lifecycle) — GET {sep24}/transaction?id=.
 * Returns { status, message, moreInfoUrl, amountOut } or null. Standard SEP-24.
 */
export async function anchorTxStatus(
  sep24: string,
  bearer: { Authorization: string },
  id: string,
): Promise<{ status: string; message: string; moreInfoUrl: string; amountOut: string } | null> {
  try {
    const res = await (await fetch(`${sep24}/transaction?id=${encodeURIComponent(id)}`, { headers: bearer })).json();
    const t = res && (res.transaction || res);
    if (!t || !t.status) return null;
    return { status: t.status, message: t.message || "", moreInfoUrl: t.more_info_url || "", amountOut: t.amount_out || "" };
  } catch (_) {
    return null;
  }
}

let _poolWrite: any;
async function poolWriteClient(): Promise<any> {
  if (!_poolWrite) {
    if (_wallet) {
      _poolWrite = await Sdk.contract.Client.from({
        contractId: POOL,
        networkPassphrase: PASSPHRASE,
        rpcUrl: RPC,
        publicKey: _wallet.address,
        signTransaction: _wallet.signTransaction,
        signAuthEntry: _wallet.signAuthEntry,
      });
      _poolWrite._from = _wallet.address;
    } else {
      const kp = Sdk.Keypair.fromSecret(DEMO_SECRET);
      const signer = Sdk.contract.basicNodeSigner(kp, PASSPHRASE);
      _poolWrite = await Sdk.contract.Client.from({
        contractId: POOL,
        networkPassphrase: PASSPHRASE,
        rpcUrl: RPC,
        publicKey: kp.publicKey(),
        signTransaction: signer.signTransaction,
        signAuthEntry: signer.signAuthEntry,
      });
      _poolWrite._from = kp.publicKey();
    }
  }
  return _poolWrite;
}

// signAndSend with a rebuild-and-retry on TRANSIENT faults. A retry self-heals a sequence
// race on the shared embedded demo key AND the load-shedding the public testnet throws under
// contention. A contract revert (Error(Contract,#N)) is DETERMINISTIC — never retried.
const _sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const _msg = (e: any) => String(e?.message ?? e ?? "");
const _isContractRevert = (e: any) => /Error\(Contract,\s*#\d+\)/.test(_msg(e));
const _isTransient = (e: any) =>
  !_isContractRevert(e) &&
  /txbadseq|tx_bad_seq|bad_seq|try_again_later|timed?\s?out|timeout|txtoolate|\b(?:429|50\d)\b|failed to (?:send|submit)|network|fetch/i.test(_msg(e));
async function sendTx(buildAt: () => Promise<any>, attempts = 5): Promise<any> {
  let lastErr: any;
  for (let i = 1; i <= attempts; i++) {
    try {
      const at = await buildAt();
      return await at.signAndSend();
    } catch (e) {
      lastErr = e;
      if (i < attempts && _isTransient(e)) {
        await _sleep(1200 + i * 900);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// ---- testnet wallet setup helpers (for the optional Freighter path) ----
const USDC = new Sdk.Asset("USDC", "GC7SWGHRQLMP4SW2AOBRSC2HFKVPNPHBH5A3PX3ZDVEJFMYKLWQ3SY3B");

async function submitClassic(tx: any): Promise<string> {
  const sent = await server.sendTransaction(tx);
  let status: string = sent.status,
    hash = sent.hash;
  for (let i = 0; i < 15 && (status === "PENDING" || status === "NOT_FOUND" || status === "TRY_AGAIN_LATER"); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const g = await server.getTransaction(hash);
      status = g.status as any;
    } catch (_) {}
  }
  if (status !== "SUCCESS") throw new Error("tx " + status);
  return hash;
}

/** Fund a testnet account with XLM via friendbot (no-op if already funded). */
export async function friendbotFund(address: string): Promise<{ ok: boolean; already?: boolean }> {
  try {
    await server.getAccount(address);
    return { ok: true, already: true };
  } catch (_) {
    const r = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
    return { ok: r.ok };
  }
}

/** Add a USDC trustline to `address`, signed by the connected wallet. */
export async function addUsdcTrustline(address: string, signTransaction: (xdr: string, opts?: any) => Promise<any>): Promise<string> {
  const acct = await server.getAccount(address);
  const tx = new Sdk.TransactionBuilder(acct, { fee: Sdk.BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Sdk.Operation.changeTrust({ asset: USDC }))
    .setTimeout(120)
    .build();
  const { signedTxXdr } = await signTransaction(tx.toXDR(), { networkPassphrase: PASSPHRASE, address });
  const signed = Sdk.TransactionBuilder.fromXDR(signedTxXdr, PASSPHRASE);
  return submitClassic(signed);
}

/**
 * Anchor an audit receipt on-chain: submit a MemoHash transaction whose memo is the
 * SHA-256 of the receipt's canonical bytes. The ledger then holds a tamper-evident,
 * TIMESTAMPED commitment to that exact receipt. Signed by the demo key. Returns
 * { txHash, sha256 }.
 */
export async function anchorReceipt(canonicalString: string): Promise<{ txHash: string; sha256: string }> {
  const kp = Sdk.Keypair.fromSecret(DEMO_SECRET);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalString)));
  const sha256 = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  const acct = await server.getAccount(kp.publicKey());
  const tx = new Sdk.TransactionBuilder(acct, { fee: Sdk.BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Sdk.Operation.payment({ destination: kp.publicKey(), asset: Sdk.Asset.native(), amount: "0.0000001" }))
    .addMemo(Sdk.Memo.hash(sha256))
    .setTimeout(120)
    .build();
  tx.sign(kp);
  const txHash = await submitClassic(tx);
  return { txHash, sha256 };
}

/** Faucet: the demo key sends `amount` USDC to `address` (needs a trustline). */
export async function faucetUsdc(address: string, amount = "5000"): Promise<string> {
  const kp = Sdk.Keypair.fromSecret(DEMO_SECRET);
  const acct = await server.getAccount(kp.publicKey());
  const tx = new Sdk.TransactionBuilder(acct, { fee: Sdk.BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Sdk.Operation.payment({ destination: address, asset: USDC, amount }))
    .setTimeout(120)
    .build();
  tx.sign(kp);
  return submitClassic(tx);
}

// snarkjs proof -> Soroban proof struct
const scProof = (p: Groth16Proof) => ({ a: buf(g1(p.pi_a)), b: buf(g2(p.pi_b)), c: buf(g1(p.pi_c)) });

export type PoolNote = { commitment: string; amount: string; pubKey: string; blinding: string; [k: string]: any };
export type DepositOpts = { forgeSource?: boolean; denySource?: boolean };
export type WriteResult = { ok: boolean; hash?: string; error?: string; denyRejected?: boolean; code?: number | null };

/**
 * Real on-chain deposit: builds a compliance proof in the browser (the source is
 * a member of the pinned ASP allow-list, bound to this commitment), then signs
 * and submits pool.deposit. The pool's commitment count goes up and tokens move.
 * Returns { ok, hash } or { ok:false, error }.
 */
export async function depositOnChain(note: PoolNote, opts: DepositOpts = {}): Promise<WriteResult> {
  try {
    const sj = await snarkjs();
    const asp = await aspWitness();
    // 1. compliance proof: prove the AUTHENTICATED depositor (field(from)) is an
    // allow-listed source, bound to this commitment.
    const src = addrField(activeAddress());
    const members = asp.members || [];
    let m = members.find((x: any) => x.sourceKey === src);
    if (opts.forgeSource) {
      // Demonstrate the auth: build a VALID proof for a DIFFERENT approved source than
      // field(from). The contract pins sourceKey = field(from) -> the ASP rejects it on-chain.
      m = members.find((x: any) => x.sourceKey !== src) || members[1] || members[0];
    } else if (!m) {
      return { ok: false, error: "this account is not an approved ASP source (only allow-listed keys can deposit)" };
    }
    if (opts.denySource) {
      // Demonstrate the DENY-LIST (non-membership) half of compliance: try to prove for a
      // source that is an allow-list member BUT sits on the sanctions deny-list. The circuit
      // enforces sourceKey NOT-IN denyList, so the witness is unsatisfiable and NO valid
      // proof can be produced — the prover literally cannot lie.
      const self = m || members[0];
      const denyWithSelf = [self.sourceKey, ...asp.denyList.slice(1)];
      try {
        await sj.groth16.fullProve(
          {
            aspRoot: asp.aspRoot,
            denyList: denyWithSelf,
            bindHash: note.commitment,
            sourceKey: self.sourceKey,
            pathElements: self.pathElements,
            leafIndex: self.leafIndex,
          },
          "/circuit/compliance.wasm?v=3",
          "/circuit/compliance_final.zkey?v=3",
        );
        return { ok: false, error: "unexpected: a deny-listed source produced a proof" };
      } catch (_) {
        return {
          ok: false,
          denyRejected: true,
          error:
            "Compliance circuit refused to prove — this source is on the sanctions deny-list, so its non-membership constraint is unsatisfiable and no valid deposit proof can exist.",
        };
      }
    }
    // Build the deny-list public inputs from the LIVE on-chain policy so an admin
    // set_deny_list is honored without a frontend redeploy; fall back to the witness snapshot.
    const liveDeny = await readDenyList();
    const denyList = liveDeny && liveDeny.length === asp.denyList.length ? liveDeny : asp.denyList;
    const compInput = {
      aspRoot: asp.aspRoot,
      denyList,
      bindHash: note.commitment,
      sourceKey: m.sourceKey,
      pathElements: m.pathElements,
      leafIndex: m.leafIndex,
    };
    const { proof: compProof } = await sj.groth16.fullProve(compInput, "/circuit/compliance.wasm?v=3", "/circuit/compliance_final.zkey?v=3");
    // 2. binding proof (disclosure): commitment opens to exactly `amount`, ctx=7
    const bindInput = {
      commitment: note.commitment,
      disclosedAmount: note.amount,
      auditContextHash: "7",
      amount: note.amount,
      pubKey: note.pubKey,
      blinding: note.blinding,
    };
    const { proof: bindProof } = await sj.groth16.fullProve(bindInput, "/circuit/disclosure.wasm", "/circuit/disclosure_final.zkey?v=3");
    // 3. signed deposit moving the REAL token amount
    const client = await poolWriteClient();
    const res = await sendTx(() =>
      client.deposit({
        from: client._from,
        amount: BigInt(note.amount),
        commitment: buf32(note.commitment),
        proof: scProof(compProof),
        binding_proof: scProof(bindProof),
      }),
    );
    const hash = res?.sendTransactionResponse?.hash || res?.getTransactionResponse?.txHash || "";
    return { ok: true, hash };
  } catch (e) {
    return { ok: false, error: friendlyPoolError(e) };
  }
}

/**
 * Trustlessly advance the pool's Merkle root: prove (merkleUpdate) that inserting
 * newLeaf into the known oldRoot yields newRoot, then submit register_root_verified.
 * Makes the just-deposited commitment part of an on-chain registered tree.
 */
export async function registerRootOnChain(
  oldRootDec: string,
  newLeafDec: string,
  newRootDec: string,
  leafIndex: number | string,
  pathElementsDec: string[],
): Promise<WriteResult> {
  try {
    const sj = await snarkjs();
    const input = {
      oldRoot: oldRootDec,
      newLeaf: newLeafDec,
      newRoot: newRootDec,
      leafIndex: String(leafIndex),
      pathElements: pathElementsDec,
    };
    const { proof } = await sj.groth16.fullProve(input, "/circuit/merkleUpdate.wasm?v=2", "/circuit/merkleUpdate_final.zkey?v=3");
    const client = await poolWriteClient();
    const res = await sendTx(() =>
      client.register_root_verified({
        proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
        old_root: buf32(oldRootDec),
        new_leaf: buf32(newLeafDec),
        new_root: buf32(newRootDec),
      }),
    );
    return { ok: true, hash: res?.sendTransactionResponse?.hash || "" };
  } catch (e) {
    return { ok: false, error: friendlyPoolError(e), code: poolErrorCode(e) };
  }
}

export const DEMO_ADDRESS = Sdk.Keypair.fromSecret(DEMO_SECRET).publicKey();

/**
 * The withdraw ext-data hash binding the recipient: keccak256(recipient XDR ||
 * public_amount) reduced mod r. Must match the contract's `ext_data_hash` recompute
 * exactly. `publicAmountDec` is the field-negative (r - amount) decimal string.
 */
export function extDataHashFor(recipient: string, publicAmountDec: string): string {
  const xdr = Sdk.nativeToScVal(recipient, { type: "address" }).toXDR(); // Uint8Array (ScVal::Address)
  const amt = buf32(publicAmountDec); // 32 bytes, big-endian
  const data = new Uint8Array(xdr.length + amt.length);
  data.set(xdr, 0);
  data.set(amt, xdr.length);
  const hex = keccak256(data); // 64-char hex (no 0x)
  return (BigInt("0x" + hex) % FIELD_R).toString();
}

/**
 * field(addr) = keccak256(addr ScVal XDR) mod r — the ASP allow-list key for an
 * account. Must match the contract's `addr_field(from)` exactly.
 */
export function addrField(address: string): string {
  const xdr = Sdk.nativeToScVal(address, { type: "address" }).toXDR();
  return (BigInt("0x" + keccak256(xdr)) % FIELD_R).toString();
}

// Map the pool contract's PoolError codes (lib.rs) to human messages.
const POOL_ERRORS: Record<number, string> = {
  1: "this root isn't recognized on-chain (the tree moved on — re-sync and retry)",
  2: "this note was already spent — its nullifier is used (double-spend rejected on-chain)",
  3: "unknown commitment — this note isn't in the pool",
  4: "the deny-list check failed on-chain",
  5: "invalid amount",
  6: "the amount isn't bound to the commitment (binding proof missing)",
  7: "the zero-knowledge proof was rejected by the on-chain verifier",
  8: "the corridor tree is full",
  9: "this leaf isn't a backed deposit, or was already inserted (unbacked-leaf insert rejected)",
  10: "this commitment was already deposited (duplicate deposit rejected — it would lock funds)",
  11: "the FX oracle has no live price for this currency (off-ramp quote unavailable)",
  12: "the live FX rate would deliver less than your minimum (slippage too high — release blocked, note unspent)",
};
function friendlyPoolError(e: any): string {
  const msg = (e && e.message) || String(e);
  const m = msg.match(/Error\(Contract,\s*#(\d+)\)/);
  if (m && POOL_ERRORS[Number(m[1])]) return POOL_ERRORS[Number(m[1])];
  return msg;
}
function poolErrorCode(e: any): number | null {
  const m = ((e && e.message) || String(e)).match(/Error\(Contract,\s*#(\d+)\)/);
  return m ? Number(m[1]) : null;
}

/**
 * Submit a signed pool.withdraw given a transfer proof + its public signals.
 * Spends the note's nullifier on-chain and releases `releaseAmount` tokens. The
 * proof's public_amount is the field-negative (r - releaseAmount): value leaving.
 */
export async function withdrawSubmit(
  proof: Groth16Proof,
  publicSignals: (string | bigint)[],
  recipientPub: string,
  releaseAmount: string | bigint,
  offrampSymbol?: string,
  minLocalOut?: number,
): Promise<WriteResult> {
  try {
    const [root, publicAmount, , n0, n1, oc0, oc1] = publicSignals as any[];
    const client = await poolWriteClient();
    const res = await sendTx(() =>
      client.withdraw({
        proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
        root: buf32(root),
        public_amount: buf32(publicAmount), // field-negative (r - amount): value leaving
        nullifiers: [buf32(n0), buf32(n1)],
        out_commitments: [buf32(oc0), buf32(oc1)],
        recipient: recipientPub || DEMO_ADDRESS,
        amount: BigInt(releaseAmount), // magnitude released; pool binds it to (r - amount)
        offramp_symbol: offrampSymbol || undefined,
        min_local_out: minLocalOut != null ? BigInt(Math.floor(minLocalOut)) : undefined,
      }),
    );
    return { ok: true, hash: res?.sendTransactionResponse?.hash || "" };
  } catch (e) {
    return { ok: false, error: friendlyPoolError(e), code: poolErrorCode(e) };
  }
}

export const txExplorer = (h: string): string => `https://stellar.expert/explorer/testnet/tx/${h}`;
export const explorer = (id: string): string => `https://stellar.expert/explorer/testnet/contract/${id}`;

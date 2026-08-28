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
//
// STRUCTURE: the read-only / server-safe layers now live under lib/soroban/* (proof encoding,
// the simulate RPC layer, the pool/reserves/policy reads, the FX oracle reads, on-chain
// verification, the PoolError map). This file keeps the browser-shaped STATEFUL core — the
// wallet singleton, the signed pool writes, the SEP anchor flow and testnet setup — and
// RE-EXPORTS everything below so every existing `@/lib/stellar` import keeps working unchanged.
import * as Sdk from "@stellar/stellar-sdk";
import { fetchWithTimeout } from "./net";
import { RPC, PASSPHRASE, DEMO_SECRET, POOL, ANCHOR, ONRAMPER } from "./constants";
import { server as rpcServer } from "./soroban/rpc";
import { server } from "./soroban/rpc";
import { buf, g1, g2, buf32, scProof, type Groth16Proof } from "./soroban/proof";
import { friendlyPoolError, poolErrorCode } from "./soroban/errors";
import { addrField, readDenyList } from "./soroban/reads";
// signAndSend with rebuild-and-retry on PRE-send transient faults only; once the network has the
// tx it polls that hash instead of resubmitting (see ./soroban/send for why). Shared with the relayer.
import { sendTx } from "./soroban/send";

// Re-export the public contract-ID / config constants so route code can import them from
// lib/stellar (their original home) OR lib/constants (a light, SDK-free bundle).
export { POOL, DISCLOSURE_VERIFIER, THRESHOLD_VERIFIER, AGGREGATE_VERIFIER, RANGE_VERIFIER, REFLECTOR_FX, POLICY_REGISTRY, RESERVES, RESERVES_VERIFIER, RESERVES_AGGREGATE, ANCHOR, ONRAMPER, RPC, PASSPHRASE } from "./constants";

// Re-export the extracted layers so the public surface of "@/lib/stellar" is unchanged.
export * from "./soroban/proof"; // Groth16Proof, fe/g1/g2/buf/buf32/scProof
export * from "./soroban/reads"; // pool/reserves/policy reads, addrField, extDataHashFor
export * from "./soroban/oracle"; // Reflector FX + on-chain off-ramp quotes
export * from "./soroban/verify"; // VerifyResult, on-chain verify + disclose-via-pool

// snarkjs is dynamic-imported (browser-only, heavy) so it never lands in a server bundle.
let _snarkjs: any = null;
async function snarkjs(): Promise<any> {
  if (!_snarkjs) _snarkjs = await import("snarkjs");
  return _snarkjs;
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
/** The active wallet signer (Freighter when connected, else null → demo key). Lets a sibling
 *  on-chain integration (lib/blend) sign through the SAME signer WalletProvider installed here,
 *  instead of reimplementing wallet signing. Additive read-only accessor. */
export function walletSigner(): WalletSigner | null {
  return _wallet;
}

// ---- SEP anchor on-ramp (REAL, no mock) ----
// ANCHOR config (imported from ./constants) = the fiat on/off-ramp's SEP home. Swapping
// that one object to a licensed anchor is the entire change to go live — the SEP-10/24
// flow below is byte-for-byte identical. See docs/ANCHOR.md.
// SEP-1 discovery + SEP-10 web-auth against the anchor: returns an authenticated bearer
// JWT + the SEP-24 transfer server. Shared by the on-ramp (deposit) and off-ramp (withdraw).
async function anchorAuth(): Promise<{ bearer: { Authorization: string }; SEP24: string; address: string }> {
  const address = activeAddress();
  // SEP-1 via the SDK resolver: a real TOML parse (size-capped) instead of regex grabbing, and it
  // gives us SIGNING_KEY, the anchor's SEP-10 server key we verify the challenge against.
  const toml = await Sdk.StellarToml.Resolver.resolve(ANCHOR.home, { timeout: 15000 });
  const { SIGNING_KEY, WEB_AUTH_ENDPOINT: WEB_AUTH, TRANSFER_SERVER_SEP0024: SEP24 } = toml;
  if (!WEB_AUTH || !SEP24 || !SIGNING_KEY) throw new Error("anchor stellar.toml is missing endpoints or SIGNING_KEY");
  const chal = await (await fetchWithTimeout(`${WEB_AUTH}?account=${address}&home_domain=${ANCHOR.home}`, {}, 15000)).json();
  if (!chal.transaction) throw new Error("SEP-10 challenge failed: " + (chal.error || "no transaction"));
  // The network is OURS, never the anchor's: a misconfigured or hostile anchor must not be able to
  // hand us a transaction for another network (e.g. mainnet) to sign.
  if (chal.network_passphrase !== PASSPHRASE) throw new Error("SEP-10 challenge is for a different network");
  // Full SEP-10 client-side validation BEFORE anything signs it: server signature by SIGNING_KEY,
  // sequence 0, time bounds, home_domain / web_auth_domain manage_data ops, no other operations.
  // readChallengeTx throws on any violation, so nothing but a well-formed auth challenge is signed.
  const { tx, clientAccountID } = Sdk.WebAuth.readChallengeTx(chal.transaction, SIGNING_KEY, PASSPHRASE, ANCHOR.home, new URL(WEB_AUTH).host);
  if (clientAccountID !== address) throw new Error("SEP-10 challenge is for a different account");
  let signedXdr: string;
  if (_wallet && _wallet.signTransaction) {
    const res = await _wallet.signTransaction(chal.transaction, { networkPassphrase: PASSPHRASE, address });
    signedXdr = res.signedTxXdr || res;
  } else {
    tx.sign(Sdk.Keypair.fromSecret(DEMO_SECRET));
    signedXdr = tx.toXDR();
  }
  const jwtRes = await (
    await fetchWithTimeout(WEB_AUTH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: signedXdr }),
    }, 15000)
  ).json();
  if (!jwtRes.token) throw new Error("SEP-10 auth failed: " + (jwtRes.error || "no token"));
  return { bearer: { Authorization: `Bearer ${jwtRes.token}` }, SEP24, address };
}

export type AnchorSession = { url: string; id: string; asset: string; address: string; sep24: string; bearer: { Authorization: string } };

export async function anchorOnramp(): Promise<AnchorSession> {
  const { bearer, SEP24, address } = await anchorAuth();
  const info = await (await fetchWithTimeout(`${SEP24}/info`, { headers: bearer }, 15000)).json();
  const assets = Object.keys(info.deposit || {});
  const asset = assets.includes("USDC") ? "USDC" : assets[0] || "USDC";
  const intr = await (
    await fetchWithTimeout(`${SEP24}/transactions/deposit/interactive`, {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ asset_code: asset, account: address }),
    }, 15000)
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
    const r = await fetchWithTimeout(`${ONRAMPER.api}/quotes/usdc_stellar/${String(fiat).toLowerCase()}?amount=${amt}&type=sell`, {
      headers: { Authorization: ONRAMPER.apiKey },
    }, 15000);
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
  const info = await (await fetchWithTimeout(`${SEP24}/info`, { headers: bearer }, 15000)).json();
  const assets = Object.keys(info.withdraw || {});
  const asset = assets.includes("USDC") ? "USDC" : assets[0] || "USDC";
  const intr = await (
    await fetchWithTimeout(`${SEP24}/transactions/withdraw/interactive`, {
      method: "POST",
      headers: { ...bearer, "Content-Type": "application/json" },
      body: JSON.stringify({ asset_code: asset, account: address }),
    }, 15000)
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
    const res = await (await fetchWithTimeout(`${sep24}/transaction?id=${encodeURIComponent(id)}`, { headers: bearer }, 15000)).json();
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
        server: rpcServer, // shared client with a request timeout (the SDK's own would wait forever)
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
        server: rpcServer, // shared client with a request timeout (the SDK's own would wait forever)
        publicKey: kp.publicKey(),
        signTransaction: signer.signTransaction,
        signAuthEntry: signer.signAuthEntry,
      });
      _poolWrite._from = kp.publicKey();
    }
  }
  return _poolWrite;
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

export const DEMO_ADDRESS = Sdk.Keypair.fromSecret(DEMO_SECRET).publicKey();

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

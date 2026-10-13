import "server-only";
// ponytail: server relayer duplicates the client deposit/register to read circuit assets from fs; do not touch the live-verified client path.
//
// Mirrors depositOnChain + registerRootOnChain from lib/stellar.ts, with two differences the
// server needs: (1) snarkjs reads wasm/zkey from disk (fs paths) instead of "/circuit/..." URLs,
// (2) asp-witness.json is read from disk instead of a browser fetch. Signs with RELAYER_SECRET (or
// STELLAR_RELAYER_SECRET), a PRIVATE key with no demo fallback. It calls pool.deposit + register_root_verified
// against the existing POOL, and USDC SAC transfer_from/transfer to move the plan owner's USDC under
// the allowance that owner signed — never the corridor admin key, never a redeploy.
import { promises as fs } from "node:fs";
import path from "node:path";
import * as Sdk from "@stellar/stellar-sdk";
import { RPC, PASSPHRASE, POOL, DEMO_SECRET } from "./constants";
import { server as rpcServer, simulate } from "./soroban/rpc";
import { USDC_SAC } from "./passkey";
import { addrField, readDenyList, loadLeavesFromChain, readCurrentRoot, type WriteResult } from "./stellar";
import { getPoseidon, makeTree, type Note } from "./zk";
// snarkjs proof -> Soroban contract args: the ONE shared server-safe copy (was re-implemented here).
import { g1, g2, buf, buf32, scProof } from "./soroban/proof";
import { POOL_ERRORS } from "./soroban/errors";
import { sendTx as sharedSendTx } from "./soroban/send";
const sendTx = (buildAt: () => Promise<any>) => sharedSendTx(buildAt, 4);

// Circuit assets ship in the serverless bundle (see next.config.mjs outputFileTracingIncludes).
const asset = (name: string): string => path.join(process.cwd(), "public", "circuit", name);

let _snarkjs: any = null;
async function snarkjs(): Promise<any> {
  if (!_snarkjs) _snarkjs = await import("snarkjs");
  return _snarkjs;
}
let _asp: any = null;
async function aspWitness(): Promise<any> {
  if (!_asp) _asp = JSON.parse(await fs.readFile(asset("asp-witness.json"), "utf8"));
  return _asp;
}

// The relayer RECEIVES user allowances (approve owner -> relayer), so it must be a private key. The
// published DEMO_SECRET is never a fallback here: anyone holding it could transfer_from every owner
// who approved it. No private key = no scheduler (routes answer 503 RELAYER_NOT_CONFIGURED).
function relayerSecret(): string | null {
  return process.env.RELAYER_SECRET || process.env.STELLAR_RELAYER_SECRET || null;
}
export const RELAYER_NOT_CONFIGURED = "scheduler relayer key not configured (RELAYER_SECRET)";
/** True iff a private relayer key is set and it is not the published demo key. */
export function relayerConfigured(): boolean {
  const s = relayerSecret();
  return !!s && s !== DEMO_SECRET;
}
function relayerKeypair(): Sdk.Keypair {
  if (!relayerConfigured()) throw new Error(RELAYER_NOT_CONFIGURED);
  return Sdk.Keypair.fromSecret(relayerSecret()!);
}
export function relayerAddress(): string {
  return relayerKeypair().publicKey();
}

let _poolWrite: any = null;
async function poolWriteClient(): Promise<any> {
  if (!_poolWrite) {
    const kp = relayerKeypair();
    const signer = Sdk.contract.basicNodeSigner(kp, PASSPHRASE);
    _poolWrite = await Sdk.contract.Client.from({
      contractId: POOL,
      networkPassphrase: PASSPHRASE,
      rpcUrl: RPC,
      server: rpcServer, // shared client with a request timeout
      publicKey: kp.publicKey(),
      signTransaction: signer.signTransaction,
      signAuthEntry: signer.signAuthEntry,
    });
    _poolWrite._from = kp.publicKey();
  }
  return _poolWrite;
}

// signAndSend via the shared wrapper (./soroban/send): rebuild-and-retry on PRE-send transient
// faults only; once the network holds the tx it polls that hash instead of resubmitting, so the
// cron can never double-deposit (#10) on a getTransaction blip.
const _sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const _msg = (e: any) => String(e?.message ?? e ?? "");

// Full PoolError code -> message map: shared server-safe copy from ./soroban/errors (was copied
// here). This wrapper still returns { error, code } combined for the cron run receipts.
function poolErr(e: any): { error: string; code: number | null } {
  const msg = _msg(e);
  const m = msg.match(/Error\(Contract,\s*#(\d+)\)/);
  const code = m ? Number(m[1]) : null;
  return { error: (code && POOL_ERRORS[code]) || msg, code };
}

// ---- the owner's USDC, under the owner's own allowance -----------------------------------------
// A scheduled run spends the OWNER's USDC, never the relayer's: when the plan is created the owner's
// wallet signs USDC SAC approve(from=owner, spender=relayer, amount, expiration_ledger), and before
// each deposit the cron pulls exactly the plan amount with transfer_from(spender=relayer, from=owner,
// to=relayer). The relayer then deposits that USDC into the pool. No allowance, no money moves.
const addrVal = (a: string) => Sdk.nativeToScVal(a, { type: "address" });
const i128 = (v: bigint) => Sdk.nativeToScVal(v, { type: "i128" });

/** Live allowance owner -> relayer in stroops (0 once expired), or null when the SAC is unreadable. */
export async function readAllowance(owner: string): Promise<bigint | null> {
  const r = await simulate(USDC_SAC, "allowance", addrVal(owner), addrVal(relayerAddress()));
  return r.ok ? BigInt(r.value) : null;
}
/** Live USDC SAC balance of `owner` in stroops, or null when unreadable. */
export async function readUsdcBalance(owner: string): Promise<bigint | null> {
  const r = await simulate(USDC_SAC, "balance", addrVal(owner));
  return r.ok ? BigInt(r.value) : null;
}

// A relayer-signed USDC SAC call. The SAC has no contract spec to fetch, so build the call directly.
async function sacCall(method: string, args: Sdk.xdr.ScVal[]): Promise<WriteResult> {
  try {
    const kp = relayerKeypair();
    const signer = Sdk.contract.basicNodeSigner(kp, PASSPHRASE);
    const res = await sendTx(() =>
      Sdk.contract.AssembledTransaction.build({
        contractId: USDC_SAC,
        networkPassphrase: PASSPHRASE,
        rpcUrl: RPC,
        server: rpcServer,
        publicKey: kp.publicKey(),
        signTransaction: signer.signTransaction,
        method,
        args,
        parseResultXdr: (r) => r,
      }),
    );
    return { ok: true, hash: res?.sendTransactionResponse?.hash || res?.getTransactionResponse?.txHash || "" };
  } catch (e) {
    return { ok: false, error: _msg(e) };
  }
}
/** Pull `stroops` of the owner's USDC to the relayer under the owner's allowance. */
export function pullFromOwner(owner: string, stroops: bigint): Promise<WriteResult> {
  const me = relayerAddress();
  return sacCall("transfer_from", [addrVal(me), addrVal(owner), addrVal(me), i128(stroops)]);
}
/** Send pulled USDC back to the owner (a run whose deposit failed after the pull). */
export function refundOwner(owner: string, stroops: bigint): Promise<WriteResult> {
  return sacCall("transfer", [addrVal(relayerAddress()), addrVal(owner), i128(stroops)]);
}

/**
 * Server deposit: build the compliance proof (relayer key is an allow-listed ASP source, bound to
 * the commitment) + the amount-binding proof, then sign pool.deposit. Mirrors depositOnChain's
 * happy path (no forge/deny demo branches — the cron never needs them).
 */
export async function relayerDeposit(note: Note): Promise<WriteResult> {
  try {
    const sj = await snarkjs();
    const asp = await aspWitness();
    const src = addrField(relayerAddress());
    const m = (asp.members || []).find((x: any) => x.sourceKey === src);
    if (!m) return { ok: false, error: "the relayer key is not an approved ASP source (only allow-listed keys can deposit)" };
    // Deny-list public inputs from the LIVE on-chain policy; fall back to the witness snapshot.
    const liveDeny = await readDenyList();
    const denyList = liveDeny && liveDeny.length === asp.denyList.length ? liveDeny : asp.denyList;
    const compInput = { aspRoot: asp.aspRoot, denyList, bindHash: note.commitment, sourceKey: m.sourceKey, pathElements: m.pathElements, leafIndex: m.leafIndex };
    const { proof: compProof } = await sj.groth16.fullProve(compInput, asset("compliance.wasm"), asset("compliance_final.zkey"));
    const bindInput = { commitment: note.commitment, disclosedAmount: note.amount, auditContextHash: "7", amount: note.amount, pubKey: note.pubKey, blinding: note.blinding };
    const { proof: bindProof } = await sj.groth16.fullProve(bindInput, asset("disclosure.wasm"), asset("disclosure_final.zkey"));
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
    return { ok: false, ...poolErr(e) };
  }
}

/**
 * Server register: reconstruct the on-chain tree (leaves verified against current_root), prove the
 * merkleUpdate old->new for this leaf, and submit register_root_verified so the commitment becomes
 * spendable. Mirrors the sender's registerNote (re-sync on UnknownRoot #1 / read-lag #3).
 */
export async function relayerRegister(note: Note): Promise<WriteResult> {
  // Always a structured result: the cron has already advanced nextDate (its claim) before calling
  // us, so a throw here would 500 the run with no receipt for a deposit that DID land.
  try {
    return await registerInner(note);
  } catch (e) {
    return { ok: false, ...poolErr(e) };
  }
}

async function registerInner(note: Note): Promise<WriteResult> {
  const sj = await snarkjs();
  const { poseidon, F } = await getPoseidon();
  const tree = makeTree(F, poseidon);
  const commitment = BigInt(note.commitment);
  let last: WriteResult = { ok: false, error: "could not register (tree unavailable)" };
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Trust reconstruction ONLY if it reproduces the on-chain root.
    let leaves: bigint[] | null = null;
    try {
      const ls = await loadLeavesFromChain();
      const onchain = await readCurrentRoot();
      if (ls && onchain != null && tree.root(ls) === onchain) leaves = ls;
    } catch {}
    if (!leaves) {
      if (attempt < 3) { await _sleep(3000); continue; }
      return { ok: false, error: "could not sync the on-chain tree" };
    }
    const already = leaves.findIndex((l) => l === commitment);
    if (already >= 0) return { ok: true }; // a prior submit landed; adopt it
    const index = leaves.length;
    const oldRoot = tree.root(leaves).toString();
    const path = tree.pathElements(leaves, index).map((x) => x.toString());
    const newRoot = tree.root([...leaves, commitment]).toString();
    try {
      const { proof } = await sj.groth16.fullProve(
        { oldRoot, newLeaf: note.commitment, newRoot, leafIndex: String(index), pathElements: path },
        asset("merkleUpdate.wasm"),
        asset("merkleUpdate_final.zkey"),
      );
      const client = await poolWriteClient();
      const res = await sendTx(() =>
        client.register_root_verified({
          proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
          old_root: buf32(oldRoot),
          new_leaf: buf32(note.commitment),
          new_root: buf32(newRoot),
        }),
      );
      return { ok: true, hash: res?.sendTransactionResponse?.hash || "" };
    } catch (e) {
      last = { ok: false, ...poolErr(e) };
      if (attempt < 3 && last.code === 1) continue; // tree advanced — re-sync
      if (attempt < 3 && last.code === 3) { await _sleep(4500); continue; } // read-after-write lag
      break;
    }
  }
  return last;
}

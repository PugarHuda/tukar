// Real Circle CCTP V2 inbound: burn USDC on Base Sepolia (EVM, domain 6) -> mint native USDC on
// Stellar testnet (domain 27). Isomorphic module: the client (CctpFund) builds the EVM burn tx and
// uses the encoding + constants below; the server routes (attest/mint) poll Circle Iris and sign
// mint_and_forward. These are Circle's OWN contracts, separate from Tukar's 8 live contracts.
//
// Encodings verified against circlefin/stellar-cctp (examples/stellar-utils.ts, examples/stellar.ts):
//   - contractStrkeyToBytes32  -> stellar-utils.ts contractStrkeyToBytes32
//   - buildForwarderHookData   -> stellar-utils.ts buildCctpForwarderHookData
//   - mintAndForward           -> stellar.ts mintAndForward / submitSorobanTx (mint_and_forward)
import * as Sdk from "@stellar/stellar-sdk";
import { RPC, PASSPHRASE, DEMO_SECRET } from "./constants";

const { StrKey } = Sdk;

// ---- Circle CCTP V2 testnet addresses / domains ----
export const CCTP = {
  // Stellar (Soroban) testnet
  stellarDomain: 27,
  forwarder: "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ",
  // EVM source: Base Sepolia
  evmDomain: 6,
  evmChainId: 84532,
  tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  evmUsdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  // Attestation service (sandbox / testnet)
  irisApi: "https://iris-api-sandbox.circle.com",
  // Fast transfer: minFinalityThreshold 1000 (2000 = standard/slow). maxFee is a ceiling; Circle
  // charges its minimum. 1% is a generous ceiling so the burn never reverts for an underpriced fee.
  minFinalityThreshold: 1000,
} as const;

// CCTP V2 TokenMessengerV2.depositForBurnWithHook — verified against
// circlefin/evm-cctp-contracts src/v2/TokenMessengerV2.sol.
export const TOKEN_MESSENGER_ABI = [
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

// ---- strkey <-> bytes32 encodings (client-side, for the EVM burn args) ----

/** A Stellar CONTRACT address (C...) as a 0x-prefixed bytes32 for EVM calldata. */
export function contractStrkeyToBytes32(strkey: string): `0x${string}` {
  if (!StrKey.isValidContract(strkey)) throw new Error(`not a contract strkey: ${strkey}`);
  return `0x${Buffer.from(StrKey.decodeContract(strkey)).toString("hex")}`;
}

/** True for any Stellar recipient the forwarder can pay: G (account), C (contract), or M (muxed). */
export function isValidStellarRecipient(s: string): boolean {
  return StrKey.isValidEd25519PublicKey(s) || StrKey.isValidContract(s) || StrKey.isValidMed25519PublicKey(s);
}

/**
 * hookData for the CctpForwarder: 32-byte header (recipient length as u32 BE at offset 28) followed
 * by the recipient strkey's UTF-8 bytes. The forwarder decodes this to know who to pay after mint.
 * Byte-for-byte identical to Circle's buildCctpForwarderHookData.
 */
export function buildForwarderHookData(recipientStrkey: string): `0x${string}` {
  if (!isValidStellarRecipient(recipientStrkey)) throw new Error(`invalid Stellar recipient: ${recipientStrkey}`);
  const recipient = Buffer.from(recipientStrkey, "utf8");
  const hookData = Buffer.alloc(32 + recipient.length);
  hookData.writeUInt32BE(recipient.length, 28);
  recipient.copy(hookData, 32);
  return `0x${hookData.toString("hex")}`;
}

// ---- Circle Iris attestation (server route calls this) ----
export type AttestResult =
  | { status: "pending" }
  | { status: "complete"; message: string; attestation: string };

/**
 * One poll of Circle Iris for a burn's attestation. 404 (not indexed yet) and any incomplete
 * status map to `pending` so the client can re-poll without seeing a 500. Returns the { message,
 * attestation } pair the Stellar mint needs once status === "complete".
 */
export async function fetchAttestation(sourceDomain: number, txHash: string): Promise<AttestResult> {
  const url = `${CCTP.irisApi}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 404) return { status: "pending" };
  if (!res.ok) return { status: "pending" };
  const json: any = await res.json();
  const m = json?.messages?.[0];
  if (m && m.status === "complete" && m.attestation && m.attestation !== "PENDING" && m.message) {
    return { status: "complete", message: m.message, attestation: m.attestation };
  }
  return { status: "pending" };
}

// ---- Stellar mint_and_forward (server route calls this) ----
const hexToScvBytes = (hex: string): Sdk.xdr.ScVal =>
  Sdk.xdr.ScVal.scvBytes(Buffer.from(hex.startsWith("0x") ? hex.slice(2) : hex, "hex"));

function relayerKeypair(): Sdk.Keypair {
  // Same fallback pattern as lib/relayer.ts: a funded testnet key so the mint works with no env.
  return Sdk.Keypair.fromSecret(process.env.STELLAR_RELAYER_SECRET || process.env.RELAYER_SECRET || DEMO_SECRET);
}

/**
 * Sign + submit mint_and_forward(message, attestation) on the Stellar CctpForwarder. Any funded
 * Stellar account can relay this (the destinationCaller in the burn is the forwarder contract, not
 * this key). Mirrors circlefin/stellar-cctp submitSorobanTx. Returns the Stellar tx hash.
 */
export async function mintAndForward(messageHex: string, attestationHex: string): Promise<string> {
  const server = new Sdk.rpc.Server(RPC);
  const kp = relayerKeypair();
  const account = await server.getAccount(kp.publicKey());
  const contract = new Sdk.Contract(CCTP.forwarder);

  const tx = new Sdk.TransactionBuilder(account, { fee: "10000000", networkPassphrase: PASSPHRASE })
    .addOperation(contract.call("mint_and_forward", hexToScvBytes(messageHex), hexToScvBytes(attestationHex)))
    .setTimeout(120)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (Sdk.rpc.Api.isSimulationError(sim)) throw new Error(`simulation failed: ${sim.error}`);
  const prepared = Sdk.rpc.assembleTransaction(tx, sim).build();
  prepared.sign(kp);

  const sent = await server.sendTransaction(prepared);
  let status = sent.status as string;
  const hash = sent.hash;
  if (status === "ERROR") throw new Error(`send failed: ${JSON.stringify(sent.errorResult ?? "")}`);
  for (let i = 0; i < 30 && (status === "PENDING" || status === "NOT_FOUND" || status === "TRY_AGAIN_LATER"); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const g = await server.getTransaction(hash);
      status = g.status as string;
      if (status === "FAILED") throw new Error(`mint_and_forward failed on-chain (tx ${hash})`);
    } catch (e) {
      if (String(e).includes("failed on-chain")) throw e;
    }
  }
  if (status !== "SUCCESS") throw new Error(`mint_and_forward not confirmed (status ${status}, tx ${hash})`);
  return hash;
}

export const evmTxExplorer = (h: string): string => `https://sepolia.basescan.org/tx/${h}`;
export const stellarTxExplorer = (h: string): string => `https://stellar.expert/explorer/testnet/tx/${h}`;

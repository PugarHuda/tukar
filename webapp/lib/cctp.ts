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
import { PASSPHRASE, DEMO_SECRET } from "./constants";
import { makeServer } from "./soroban/rpc"; // rpc.Server with a request timeout
import { fetchWithTimeout } from "./net";

const { StrKey } = Sdk;

// ---- Circle CCTP V2 testnet addresses / domains ----
export const CCTP = {
  // Stellar (Soroban) testnet
  stellarDomain: 27,
  forwarder: "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ",
  // Outbound (Stellar -> EVM): TokenMessengerMinterV2 + native USDC SAC on Stellar testnet.
  stellarTokenMessenger: "CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP",
  stellarUsdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  // EVM source: Base Sepolia
  evmDomain: 6,
  evmChainId: 84532,
  tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  // Outbound mint leg: user calls receiveMessage on the Base Sepolia MessageTransmitterV2.
  evmMessageTransmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
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
  | { status: "complete"; message: string; attestation: string }
  // Iris unreachable / non-2xx: the client should offer a retry, not silently poll forever.
  | { status: "error"; error: string };

/**
 * One poll of Circle Iris for a burn's attestation. `pending` means Iris genuinely does not have it
 * yet (404 = not indexed, or an entry whose status/attestation is still pending). Anything else
 * (non-2xx, network failure, timeout, malformed body) THROWS so the caller can log it and surface a
 * retryable error instead of masking an outage as "pending". Returns the { message, attestation }
 * pair the Stellar mint needs once status === "complete".
 */
export async function fetchAttestation(sourceDomain: number, txHash: string): Promise<AttestResult> {
  const url = `${CCTP.irisApi}/v2/messages/${sourceDomain}?transactionHash=${txHash}`;
  const res = await fetchWithTimeout(url, { headers: { accept: "application/json" } }, 15000);
  if (res.status === 404) return { status: "pending" };
  if (!res.ok) throw new Error(`iris responded ${res.status}`);
  const json: any = await res.json();
  const m = json?.messages?.[0];
  if (m && m.status === "complete" && m.attestation && m.attestation !== "PENDING" && m.message) {
    return { status: "complete", message: m.message, attestation: m.attestation };
  }
  return { status: "pending" };
}

// ---- Circle Iris fee schedule ----
// GET {irisApi}/v2/burn/USDC/fees/{sourceDomainId}/{destDomainId} (Circle API reference,
// "Get USDC transfer fees"): one entry per finality threshold, minimumFee in basis points.
export type CctpBurnFee = {
  finalityThreshold: number; // 1000 = fast, 2000 = standard
  minimumFee: number; // basis points (1 = 0.01%)
  forwardFee?: { low: number; medium: number; high: number };
};

/** Circle's current fee schedule for a src -> dst USDC burn. Throws on a non-2xx / malformed reply. */
export async function fetchBurnFees(srcDomain: number = CCTP.evmDomain, dstDomain: number = CCTP.stellarDomain): Promise<CctpBurnFee[]> {
  const url = `${CCTP.irisApi}/v2/burn/USDC/fees/${srcDomain}/${dstDomain}`;
  const res = await fetchWithTimeout(url, { headers: { accept: "application/json" } }, 15000);
  if (!res.ok) throw new Error(`iris fees responded ${res.status}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error("iris fees: unexpected response shape");
  return json.filter((f: any) => Number.isInteger(f?.finalityThreshold) && Number.isFinite(f?.minimumFee) && f.minimumFee >= 0);
}

/**
 * The minimum fee (bps) that applies to a burn submitted with `minFinalityThreshold`: the exact
 * tier if listed, else the cheapest tier at or above it (a burn that accepts a slower finality
 * cannot be charged the faster tier). null when no tier covers it.
 */
export function minimumFeeBps(fees: CctpBurnFee[], minFinalityThreshold: number = CCTP.minFinalityThreshold): number | null {
  const eligible = fees.filter((f) => f.finalityThreshold >= minFinalityThreshold).sort((a, b) => a.finalityThreshold - b.finalityThreshold);
  return eligible.length ? eligible[0]!.minimumFee : null;
}

/** Fee in USDC base units for `amount` at `bps`, rounded UP so maxFee never undercuts Circle's minimum. */
export function feeForAmount(amount: bigint, bps: number): bigint {
  if (amount < 0n || !Number.isInteger(bps) || bps < 0) throw new Error("feeForAmount: amount and bps must be non-negative integers");
  return (amount * BigInt(bps) + 9999n) / 10000n;
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
  const server = makeServer();
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

// ===========================================================================
// OUTBOUND: burn USDC on Stellar testnet (domain 27) -> mint on Base Sepolia (domain 6).
// The Stellar burn is signed by the connected wallet if present, else the funded DEMO_SECRET
// (matching how the app signs other Stellar writes). The EVM mint (receiveMessage) is
// permissionless and submitted by the user's own Base Sepolia wallet.
// Burn encoding verified against circlefin/stellar-cctp examples/stellar.ts depositForBurn:
//   approve(from, spender, amount, expiration) on the USDC SAC, then
//   deposit_for_burn(caller, amount:i128, destination_domain:u32, mint_recipient:bytes32,
//     burn_token:Address, destination_caller:bytes32, max_fee:i128, min_finality_threshold:u32)
//   with mint_recipient = the 20-byte EVM address left-padded to bytes32.
// ===========================================================================

// receiveMessage on Base Sepolia MessageTransmitterV2 — verified against
// circlefin/evm-cctp-contracts src/v2/MessageTransmitterV2.sol. Permissionless: anyone can relay.
export const MESSAGE_TRANSMITTER_ABI = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export function isValidEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

/** A 20-byte EVM address left-padded to a 0x-prefixed bytes32 (Circle's mintRecipient encoding). */
export function evmAddressToBytes32(addr: string): `0x${string}` {
  const hex = addr.trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) throw new Error(`invalid EVM address: ${addr}`);
  return `0x${"0".repeat(24)}${hex.toLowerCase()}`;
}

// A wallet callback (Freighter) for signing a Stellar tx. Absent -> DEMO_SECRET signs.
export type StellarWallet = {
  address: string;
  signTransaction: (xdr: string, opts?: any) => Promise<{ signedTxXdr: string }>;
};

/** The built-in throwaway demo key's public address (funded testnet USDC + XLM). */
export function demoStellarAddress(): string {
  return Sdk.Keypair.fromSecret(DEMO_SECRET).publicKey();
}

async function waitForSoroban(server: Sdk.rpc.Server, hash: string, label: string): Promise<void> {
  let status = "PENDING";
  for (let i = 0; i < 30 && (status === "PENDING" || status === "NOT_FOUND" || status === "TRY_AGAIN_LATER"); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const g = await server.getTransaction(hash);
      status = g.status as string;
      if (status === "FAILED") throw new Error(`${label} failed on-chain (tx ${hash})`);
    } catch (e) {
      if (String(e).includes("failed on-chain")) throw e;
    }
  }
  if (status !== "SUCCESS") throw new Error(`${label} not confirmed (status ${status}, tx ${hash})`);
}

/** Build + sign (wallet or DEMO_SECRET) + send one Soroban invocation. Returns the tx hash. */
async function submitSoroban(contractId: string, method: string, args: Sdk.xdr.ScVal[], wallet?: StellarWallet): Promise<string> {
  const server = makeServer();
  const kp = wallet ? null : Sdk.Keypair.fromSecret(DEMO_SECRET);
  const address = wallet ? wallet.address : kp!.publicKey();
  const account = await server.getAccount(address);
  const contract = new Sdk.Contract(contractId);

  const tx = new Sdk.TransactionBuilder(account, { fee: "10000000", networkPassphrase: PASSPHRASE })
    .addOperation(contract.call(method, ...args))
    .setTimeout(120)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (Sdk.rpc.Api.isSimulationError(sim)) throw new Error(`simulation failed (${method}): ${sim.error}`);
  const prepared = Sdk.rpc.assembleTransaction(tx, sim).build();

  let signed: Sdk.Transaction;
  if (wallet) {
    const res = await wallet.signTransaction(prepared.toXDR(), { networkPassphrase: PASSPHRASE, address });
    signed = Sdk.TransactionBuilder.fromXDR(res.signedTxXdr, PASSPHRASE) as Sdk.Transaction;
  } else {
    prepared.sign(kp!);
    signed = prepared;
  }

  const sent = await server.sendTransaction(signed);
  if ((sent.status as string) === "ERROR") throw new Error(`${method} send failed: ${JSON.stringify(sent.errorResult ?? "")}`);
  await waitForSoroban(server, sent.hash, method);
  return sent.hash;
}

/**
 * Burn USDC on Stellar for a CCTP transfer to Base Sepolia. Two signed Soroban txs: approve the
 * TokenMessengerMinter to spend the USDC, then deposit_for_burn. destination_caller is zeroed so
 * the EVM receiveMessage is permissionless (the user submits it from their own wallet). Returns
 * the burn tx hash (64-hex, no 0x prefix — prepend 0x before handing it to Circle Iris).
 */
export async function depositForBurnStellar(opts: { amount: bigint; mintRecipientEvm: string; wallet?: StellarWallet }): Promise<{ burnTx: string; sender: string }> {
  const { amount, mintRecipientEvm, wallet } = opts;
  if (amount <= 0n) throw new Error("amount must be positive");
  if (!isValidEvmAddress(mintRecipientEvm)) throw new Error("enter a valid 0x EVM recipient address");
  const sender = wallet ? wallet.address : demoStellarAddress();
  const server = makeServer();

  // 1) approve(from, spender, amount, expiration_ledger) on the USDC SAC.
  const latest = await server.getLatestLedger();
  const expiration = latest.sequence + 100_000;
  await submitSoroban(
    CCTP.stellarUsdc,
    "approve",
    [
      new Sdk.Address(sender).toScVal(),
      new Sdk.Address(CCTP.stellarTokenMessenger).toScVal(),
      Sdk.nativeToScVal(amount, { type: "i128" }),
      Sdk.nativeToScVal(expiration, { type: "u32" }),
    ],
    wallet,
  );

  // 2) deposit_for_burn — the real burn.
  const mintRecipient = hexToScvBytes(evmAddressToBytes32(mintRecipientEvm));
  const destinationCaller = Sdk.xdr.ScVal.scvBytes(Buffer.alloc(32)); // zero => permissionless receive
  const maxFee = amount / 100n; // 1% ceiling; Circle charges its (lower) minimum for fast transfer
  const burnTx = await submitSoroban(
    CCTP.stellarTokenMessenger,
    "deposit_for_burn",
    [
      new Sdk.Address(sender).toScVal(),
      Sdk.nativeToScVal(amount, { type: "i128" }),
      Sdk.nativeToScVal(CCTP.evmDomain, { type: "u32" }),
      mintRecipient,
      new Sdk.Address(CCTP.stellarUsdc).toScVal(),
      destinationCaller,
      Sdk.nativeToScVal(maxFee, { type: "i128" }),
      Sdk.nativeToScVal(CCTP.minFinalityThreshold, { type: "u32" }),
    ],
    wallet,
  );
  return { burnTx, sender };
}

/**
 * Submit receiveMessage(message, attestation) on the Base Sepolia MessageTransmitterV2 via the
 * user's connected EVM wallet (viem over window.ethereum). Permissionless — the user pays gas and
 * USDC lands at the mintRecipient. viem is dynamically imported so nothing loads at SSR.
 */
export async function submitReceiveMessageEvm(eth: any, message: string, attestation: string): Promise<{ txHash: string; relayer: string }> {
  const { createWalletClient, createPublicClient, custom, http } = await import("viem");
  const { baseSepolia } = await import("viem/chains");
  const walletClient = createWalletClient({ chain: baseSepolia, transport: custom(eth) });
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

  const [account] = await walletClient.requestAddresses();
  if (!account) throw new Error("No account authorized in the wallet.");
  if ((await walletClient.getChainId()) !== baseSepolia.id) {
    try {
      await walletClient.switchChain({ id: baseSepolia.id });
    } catch {
      await walletClient.addChain({ chain: baseSepolia });
      await walletClient.switchChain({ id: baseSepolia.id });
    }
  }

  const txHash = await walletClient.writeContract({
    account,
    chain: baseSepolia,
    address: CCTP.evmMessageTransmitter as `0x${string}`,
    abi: MESSAGE_TRANSMITTER_ABI,
    functionName: "receiveMessage",
    args: [message as `0x${string}`, attestation as `0x${string}`],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, relayer: account };
}

export const evmTxExplorer = (h: string): string => `https://sepolia.basescan.org/tx/${h}`;
export const stellarTxExplorer = (h: string): string => `https://stellar.expert/explorer/testnet/tx/${h}`;

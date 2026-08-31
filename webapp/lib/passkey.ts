// Passkey smart-wallet login for Tukar (WebAuthn, no seed phrase), built on passkey-kit 0.16.5.
//
// The wallet is a Soroban contract account (C-address) on testnet whose only signer is the user's
// passkey (secp256r1, verified on-chain by the wallet's __check_auth). A contract account cannot be a
// transaction source, so every pool write is built against the SDK's null account, its auth entries
// are signed by the passkey (kit.sign) and the {func, auth} pair is submitted through the
// OpenZeppelin Stellar Channels relayer, which builds the envelope and pays the fee. The relayer key
// is server-held (app/api/passkey/send); nothing here talks to the relayer directly.
//
// Browser-only: passkey-kit reads WebAuthn + localStorage, so it is imported lazily inside functions.
// The constants at the top are plain values the server route imports too.
import * as Sdk from "@stellar/stellar-sdk";
import { RPC, PASSPHRASE, DEMO_SECRET, USDC_ISSUER } from "./constants";
import { server, simulate } from "./soroban/rpc";
import { awaitTx } from "./soroban/send";
import type { WalletSigner } from "./stellar";

/** Smart-wallet WASM hash passkey-kit 0.16.5 deploys on testnet (Protocol 27+ wallet). */
export const WALLET_WASM_HASH = "502ea4e7bdb3ea99880941f1d35ceb67fb598692c0bb40f842ef9c9f17d58b58";
/** OpenZeppelin Stellar Channels relayer, testnet. Server-side only (needs OZ_CHANNELS_API_KEY). */
export const CHANNELS_TESTNET_URL = "https://channels.openzeppelin.com/testnet";
/** The pool's settlement asset as a contract: a C-address holds USDC as a SAC balance (no trustline). */
export const USDC_SAC = new Sdk.Asset("USDC", USDC_ISSUER).contractId(PASSPHRASE);
export const APP_NAME = "Tukar";

type Kit = import("passkey-kit").PasskeyKit;
let _kit: Kit | null = null;

/** Lazy singleton kit; the keyId -> wallet record persists in localStorage ("passkey-kit:credentials"). */
export async function passkeyKit(): Promise<Kit> {
  if (_kit) return _kit;
  const [{ PasskeyKit }, { LocalStorageAdapter }] = await Promise.all([import("passkey-kit"), import("passkey-kit/storage")]);
  _kit = new PasskeyKit({ rpcUrl: RPC, networkPassphrase: PASSPHRASE, walletWasmHash: WALLET_WASM_HASH, storage: new LocalStorageAdapter() });
  return _kit;
}

export function disconnectPasskey(): void {
  _kit?.disconnect();
}

/**
 * Submit a built transaction's host function + auth through the server relayer route. Resolves to
 * the tx hash.
 *
 * Known ceiling, measured against channels.openzeppelin.com/testnet on 2026-08-31: the relayer
 * decodes an auth entry with its own (older) XDR and rejects SorobanCredentialsType value 2, i.e.
 * the CAP-0071-02 address-bound credentials passkey-kit 0.16.5 is the only thing it will sign
 * ("there is deliberately NO V1 signing path"). A wallet DEPLOY relays fine (its entry is signed by
 * the ed25519 deployer, so it stays V1); a passkey-signed pool write does not. The signature itself
 * is valid on-chain (verified: the same signed entry succeeds when submitted straight to RPC), so
 * this is purely the relayer's decoder. Fix is upstream (relayer bumps its SDK) or a second submit
 * path that pays the fee from an app-held source account.
 */
async function relay(xdr: string): Promise<string> {
  const res = await fetch("/api/passkey/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ xdr }) });
  const j = await res.json().catch(() => ({}));
  if (j.configured === false) throw new Error("The passkey relayer is not configured on this deployment (OZ_CHANNELS_API_KEY is missing).");
  if (!res.ok || !j.hash) {
    if (/SorobanCredentialsType|`func` or `auth` encoding/i.test(String(j.error || "")))
      throw new Error("The fee relayer cannot yet decode the auth entry a passkey signs (CAP-0071-02 address-bound credentials), so this write cannot be sponsored. Connect a keypair wallet or use the testnet key for this step.");
    throw new Error(j.error || `relayer submit failed (HTTP ${res.status})`);
  }
  return j.hash as string;
}

/** Register a passkey, deploy its smart wallet through the relayer, connect it. */
export async function createPasskeyWallet(userName: string): Promise<{ contractId: string; keyId: string; hash: string }> {
  const kit = await passkeyKit();
  const created = await kit.createWallet(APP_NAME, userName);
  const hash = await relay(created.signedTx);
  await kit.connectWallet({ keyId: created.keyIdBase64 });
  return { contractId: created.contractId, keyId: created.keyIdBase64, hash };
}

/**
 * Connect an existing wallet. Without a keyId the browser runs a discoverable-credential prompt
 * (the user picks the passkey); with one (rehydrate) it is silent: local record, else deterministic
 * derivation confirmed on-chain, then the kit verifies the code hash and that the key is a live signer.
 */
export async function connectPasskeyWallet(keyId?: string): Promise<{ contractId: string; keyId: string }> {
  const kit = await passkeyKit();
  try {
    const r = await kit.connectWallet(keyId ? { keyId } : undefined);
    return { contractId: r.contractId, keyId: r.keyIdBase64 };
  } catch (e: any) {
    // PasskeyKitErrorCode.WALLET_NOT_FOUND = 2003: the passkey exists but no wallet was deployed for it.
    if (e?.code === 2003) throw new Error("No Tukar wallet exists for that passkey yet. Use \"New passkey wallet\" to create one.");
    throw e instanceof Error ? e : new Error(String(e?.message || e));
  }
}

/**
 * The WalletSigner a passkey wallet installs in lib/stellar. signTransaction is honestly unsupported:
 * the wallet has no ed25519 key and cannot be a classic transaction source (SEP-10 web-auth,
 * trustlines, payments). signAuthEntry takes a FULL SorobanAuthorizationEntry (base64) and returns it
 * signed, not the SEP-43 preimage contract: a passkey signature is a WebAuthn assertion, not raw
 * ed25519 bytes, so the SDK's default authorizeEntry cannot express it. submit is what pool writes
 * use, and it currently fails at the relayer (see the `relay` note above) even though the signature
 * it produces is accepted by the network.
 */
export function makePasskeySigner(kit: Kit, contractId: string): WalletSigner {
  return {
    address: contractId,
    signTransaction: async () => {
      throw new Error("A passkey smart wallet cannot sign classic transactions (SEP-10 anchor login, trustlines, payments); connect a keypair wallet for this step.");
    },
    signAuthEntry: async (entryXdr: string) => {
      const signed = await kit.signAuthEntry(Sdk.xdr.SorobanAuthorizationEntry.fromXDR(entryXdr, "base64"));
      return { signedAuthEntry: signed.toXDR("base64"), signerAddress: contractId };
    },
    submit: async (at: any) => {
      await kit.sign(at); // WebAuthn prompt only when the wallet has auth entries to sign (deposit); none for withdraw
      const hash = await relay(at.built.toXDR());
      return { sendTransactionResponse: { hash }, getTransactionResponse: { status: "SUCCESS", txHash: hash } };
    },
  };
}

/** USDC SAC balance of any address (stroops), null when the read fails. */
export async function usdcBalance(address: string): Promise<bigint | null> {
  const r = await simulate(USDC_SAC, "balance", Sdk.nativeToScVal(address, { type: "address" }));
  return r.ok ? BigInt(r.value) : null;
}

/**
 * Test-USDC faucet for a contract account: a classic payment cannot target a C-address, so the demo
 * key sends a SAC transfer instead (a contract balance needs no trustline). Returns the tx hash.
 */
export async function faucetUsdcToContract(to: string, amountUsdc = "100"): Promise<string> {
  const kp = Sdk.Keypair.fromSecret(DEMO_SECRET);
  const acct = await server.getAccount(kp.publicKey());
  const addr = (a: string) => Sdk.nativeToScVal(a, { type: "address" });
  const tx = new Sdk.TransactionBuilder(acct, { fee: Sdk.BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(new Sdk.Contract(USDC_SAC).call("transfer", addr(kp.publicKey()), addr(to), Sdk.nativeToScVal(BigInt(amountUsdc) * 10_000_000n, { type: "i128" })))
    .setTimeout(60)
    .build();
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(kp);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error("faucet transfer rejected by the network");
  const got = await awaitTx(server, sent.hash);
  if (got?.status !== "SUCCESS") throw new Error(`faucet transfer ${got?.status || "unconfirmed"}`);
  return sent.hash;
}

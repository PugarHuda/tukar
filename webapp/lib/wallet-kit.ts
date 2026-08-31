"use client";

// Lazy singleton for @creit.tech/stellar-wallets-kit (v2.5.0, fully static API). The kit pulls in
// web-component/preact browser deps and reads localStorage at import, so it must load ONLY in the
// browser: every import here is dynamic and guarded, never at module top-level. init() is
// idempotent (guarded by _inited) so the profile-check, connect, and rehydrate paths share one kit.
//
// The seven modules are the wallets Tukar advertises: Freighter, xBull, Albedo, Rabet, Lobstr, Hana,
// and Ledger (WebUSB; the kit's hideUnsupportedWallets hides it where WebUSB is missing).
// productId for each is a stable id ("freighter", "xbull", ..., "LEDGER") which we surface as the
// wallet `kind`; FREIGHTER_ID === "freighter" so the existing freighter-only branches keep working.
import { Keypair } from "@stellar/stellar-sdk";
import { DEMO_SECRET, PASSPHRASE } from "./constants";

type KitModule = typeof import("@creit.tech/stellar-wallets-kit");
type KitStatic = KitModule["StellarWalletsKit"];

let _mod: KitModule | null = null;

async function kitModule(): Promise<KitModule> {
  if (_mod) return _mod;
  const mod = await import("@creit.tech/stellar-wallets-kit");
  const [freighter, xbull, albedo, rabet, lobstr, hana, ledger] = await Promise.all([
    import("@creit.tech/stellar-wallets-kit/modules/freighter"),
    import("@creit.tech/stellar-wallets-kit/modules/xbull"),
    import("@creit.tech/stellar-wallets-kit/modules/albedo"),
    import("@creit.tech/stellar-wallets-kit/modules/rabet"),
    import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
    import("@creit.tech/stellar-wallets-kit/modules/hana"),
    import("@creit.tech/stellar-wallets-kit/modules/ledger"),
  ]);
  mod.StellarWalletsKit.init({
    network: mod.Networks.TESTNET,
    theme: mod.SwkAppDarkTheme,
    authModal: { hideUnsupportedWallets: true },
    modules: [
      new freighter.FreighterModule(),
      new xbull.xBullModule(),
      new albedo.AlbedoModule(),
      new rabet.RabetModule(),
      new lobstr.LobstrModule(),
      new hana.HanaModule(),
      new ledger.LedgerModule(),
    ],
  });
  _mod = mod;
  return mod;
}

export async function walletKit(): Promise<KitStatic> {
  return (await kitModule()).StellarWalletsKit;
}

/**
 * Open the kit's wallet picker and resolve with the chosen address, or reject when the user
 * dismisses it.
 *
 * Why this wrapper: authModal() paints the picker, then awaits refreshSupportedWallets() (each
 * module races a 1s timer) and only subscribes to its own close event afterwards. On the first
 * open the wallet list appears only when that finishes, so the gap is invisible; on every later
 * open the list is already painted, so the picker looks ready for up to a second while a click
 * outside or on the X is dropped on the floor. The picker then stays open and this promise never
 * settles, leaving "Connect wallet" spinning forever. We subscribe to the close event first and
 * re-emit it until the kit is listening, so the first dismissal always closes the picker.
 */
export async function openWalletPicker(): Promise<{ address: string }> {
  const { StellarWalletsKit, closeEvent } = await kitModule();
  let dismissed = false;
  const unsub = closeEvent.subscribe(() => {
    dismissed = true;
  });
  const replay = setInterval(() => {
    if (dismissed) closeEvent.next();
  }, 150);
  try {
    return await StellarWalletsKit.authModal();
  } finally {
    clearInterval(replay);
    unsub();
  }
}

/** Subscribe to a kit event; resolves to the unsubscribe function. Names confirmed in types/mod.d.ts. */
export async function onKitEvent(
  type: "DISCONNECT" | "STATE_UPDATED",
  cb: (payload: { address?: string; networkPassphrase?: string }) => void,
): Promise<() => void> {
  const { StellarWalletsKit, KitEventType } = await kitModule();
  return type === "DISCONNECT"
    ? StellarWalletsKit.on(KitEventType.DISCONNECT, () => cb({}))
    : StellarWalletsKit.on(KitEventType.STATE_UPDATED, (e) => cb(e.payload));
}

// The kit rejects with plain { code, message } objects (sdk/utils parseError), not Error instances.
export const kitError = (e: unknown): Error =>
  e instanceof Error ? e : new Error((e as any)?.message || "Unhandled error from the wallet");

// ---- Network guard ----
// Wallets like Freighter/xBull/Lobstr let the user pick a network the dapp cannot override. When
// the wallet is not on Testnet, signing is blocked here (every signer path calls assertNetwork)
// until a re-check passes. Modules that cannot report a network (Albedo, Rabet, Ledger) read as
// "unknown", which does not block: those sign with the passphrase we pass explicitly.
let _wrongNetwork: string | null = null;

/** Ask the wallet which network it is on. Returns its name if it is NOT Testnet, else null. */
export async function checkNetwork(kit: KitStatic): Promise<string | null> {
  let bad: string | null = null;
  try {
    const net = await kit.getNetwork();
    if (net.networkPassphrase !== PASSPHRASE) bad = net.network || "another network";
  } catch {
    // Module cannot report its network; do not block.
  }
  _wrongNetwork = bad;
  return bad;
}

export function clearNetworkGuard(): void {
  _wrongNetwork = null;
}

export function assertNetwork(): void {
  if (_wrongNetwork) throw new Error(`Your wallet is on ${_wrongNetwork}; switch it to Testnet`);
}

// ---- Message signing (SEP-53) ----
const SEP53_PREFIX = "Stellar Signed Message:\n";

/** SHA256("Stellar Signed Message:\n" + message): the exact bytes SEP-53 wallets sign. */
export async function sep53Hash(message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const prefix = enc.encode(SEP53_PREFIX);
  const msg = enc.encode(message);
  const payload = new Uint8Array(prefix.length + msg.length);
  payload.set(prefix, 0);
  payload.set(msg, prefix.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
}

/**
 * Sign an arbitrary message with the connected wallet and return the base64 signature.
 * kind "demo" signs the SEP-53 payload locally with the built-in testnet key; every other kind
 * goes through the kit's active module (signMessage per SEP-43, base64 out). Throws an Error with
 * the wallet's own message when the module does not support message signing (Albedo, Rabet, Ledger).
 */
export async function signMessageWithWallet(message: string, address: string, kind: string | null): Promise<string> {
  if (kind === "demo" || kind === null) {
    const sig = Keypair.fromSecret(DEMO_SECRET).sign(Buffer.from(await sep53Hash(message)));
    return Buffer.from(sig).toString("base64");
  }
  // A passkey smart wallet (lib/passkey.ts) is a contract account with a secp256r1 signer: there is
  // no ed25519 key to produce a SEP-53 signature, and the server verifies SEP-53 against a G-address.
  if (kind === "passkey") {
    throw new Error("A passkey smart wallet cannot sign messages (SEP-53 needs an ed25519 key); connect Freighter, xBull, Lobstr or Hana for this step.");
  }
  assertNetwork();
  const kit = await walletKit();
  try {
    const { signedMessage } = await kit.signMessage(message, { address, networkPassphrase: PASSPHRASE });
    if (!signedMessage) throw new Error("the wallet returned no signature");
    // Modules normalise to a base64 string (Freighter v4 bytes are base64-encoded by the kit).
    return typeof signedMessage === "string" ? signedMessage : Buffer.from(signedMessage as Uint8Array).toString("base64");
  } catch (e) {
    throw kitError(e);
  }
}

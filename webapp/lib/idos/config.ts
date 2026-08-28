// Client-safe idOS config. Only NEXT_PUBLIC_* (non-secret) values live here — the consumer's
// auth + encryption PUBLIC keys, the playground node/enclave URLs, and the optional trusted-issuer
// auth key used to filter the user's credentials. Secrets stay server-side (lib/idos/consumer.server).
//
// NEXT_PUBLIC_* are inlined at build time, so when they are absent the build still succeeds and
// `idosClientConfigured` is false -> the UI shows a "not configured" state instead of crashing.

// Playground testnet defaults; overridable via env for another network.
export const IDOS_NODE_URL =
  process.env.NEXT_PUBLIC_IDOS_NODE_URL || "https://nodes.playground.idos.network";
export const IDOS_ENCLAVE_URL =
  process.env.NEXT_PUBLIC_IDOS_ENCLAVE_URL || "https://enclave.playground.idos.network/";

// This app's consumer identity (generated once by scripts/idos-gen-consumer.mjs).
export const IDOS_CONSUMER_AUTH_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_IDOS_CONSUMER_AUTH_PUBLIC_KEY || "";
export const IDOS_CONSUMER_ENCRYPTION_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_IDOS_CONSUMER_ENCRYPTION_PUBLIC_KEY || "";

// Auth public key (hex) of the issuer whose KYC credentials we accept, used to filter the user's
// credentials client-side. Optional: idOS issuers are gated, so which issuer counts as trusted is a
// deployment decision. Unset -> we can still show profile status but cannot match a KYC credential.
export const IDOS_ISSUER_AUTH_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_IDOS_ISSUER_AUTH_PUBLIC_KEY || "";

// The mount point for the idOS enclave iframe. Must exist in the DOM before createClient().
export const IDOS_ENCLAVE_CONTAINER_ID = "idOS-enclave";

// Configured when this app has a consumer identity to grant access to.
export const idosClientConfigured = Boolean(
  IDOS_CONSUMER_AUTH_PUBLIC_KEY && IDOS_CONSUMER_ENCRYPTION_PUBLIC_KEY,
);

// Server-side residency deny list: IDOS_DENY_COUNTRIES="KP,IR" (ISO 3166-1 alpha-2, any case).
// Read per call so tests and deployments can change it without a module reload. Default empty.
export function deniedCountries(): string[] {
  return (process.env.IDOS_DENY_COUNTRIES || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

// The message a wallet signs (SEP-53) to bind an idOS credential share to its Stellar address.
// Shared by the client (lib/wallet-kit signMessageWithWallet) and the server (lib/auth verify).
export const idosBindingMessage = (sharedCredentialId: string) => `Tukar idOS credential ${sharedCredentialId}`;

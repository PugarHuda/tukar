import "server-only";
// Server-only idOS CONSUMER: reads a credential a user shared with THIS app's consumer key,
// decrypts it with our recipient encryption key, and verifies its issuer signature against the
// issuer(s) we trust. No admin secret and no credential minting happen here — a consumer only
// READS what a user has granted. Mirrors the reference examples/pay-demo/app/providers/idos.server.ts.
//
// Env (secrets, from scripts/idos-gen-consumer.mjs -> .env.local):
//   IDOS_CONSUMER_SIGNER            base64 nacl.sign secret key (the consumer auth signer)
//   IDOS_RECIPIENT_ENC_PRIVATE_KEY  base64 nacl.box secret key (decrypts shared credentials)
// Env (non-secret):
//   IDOS_NODE_URL                   playground kwil node (default below)
//   IDOS_ACCEPTED_ISSUERS           JSON array of {issuer, publicKeyMultibase} we trust (optional)
//   IDOS_DENY_COUNTRIES             comma-separated ISO country codes we refuse (default empty)
import type { idOSConsumer as idOSConsumerType } from "@idos-network/consumer";
import { checkCredentialContent } from "./checks";

const NODE_URL = process.env.IDOS_NODE_URL || "https://nodes.playground.idos.network";

// Configured only when BOTH consumer secrets are present. Absent -> the route reports
// { configured:false } and the UI degrades honestly, exactly like the Reclaim path.
export const idosConfigured = Boolean(
  process.env.IDOS_CONSUMER_SIGNER && process.env.IDOS_RECIPIENT_ENC_PRIVATE_KEY,
);

// Issuers this consumer trusts. idOS credentials are minted by gated issuers; we cannot mint one,
// so which issuer(s) count as valid KYC is a deployment decision supplied via env. Empty when
// unset -> a credential can be read but not verified as trusted (reported honestly downstream).
type AcceptedIssuer = { issuer: string; publicKeyMultibase: string };
function acceptedIssuers(): AcceptedIssuer[] {
  const raw = process.env.IDOS_ACCEPTED_ISSUERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let _consumer: Promise<idOSConsumerType> | null = null;
async function consumer(): Promise<idOSConsumerType> {
  if (!idosConfigured) throw new Error("idOS consumer is not configured");
  if (!_consumer) {
    _consumer = (async () => {
      // Dynamic import: these ESM-only packages must never be pulled into a client bundle.
      const nacl = (await import("tweetnacl")).default;
      const { idOSConsumer } = await import("@idos-network/consumer");
      return idOSConsumer.init({
        nodeUrl: NODE_URL,
        consumerSigner: nacl.sign.keyPair.fromSecretKey(
          Buffer.from(process.env.IDOS_CONSUMER_SIGNER as string, "base64"),
        ),
        recipientEncryptionPrivateKey: process.env.IDOS_RECIPIENT_ENC_PRIVATE_KEY as string,
      });
    })();
  }
  return _consumer;
}

// WHY A VERIFIED SHARE IS NOT A WALLET BINDING.
// An idOS access grant identifies its owner by idOS user id (ag_owner_user_id), never by wallet.
// To tie a Stellar address to that owner we would have to read the wallets registered to that user
// id, and the installed SDK has no such read: @idos-network/consumer 's whole surface is
// getCredentialShared*/getAccessGrants*/getCredentialsSharedByUser/verifyCredential, and the kwil
// action set underneath it (@idos-network/kwil-infra/actions actionSchema) has exactly one wallet
// read, `get_wallets`, which takes no arguments and is scoped to the kwil @caller (us, the
// consumer). The only address-keyed action, `has_profile`, answers a boolean about SOME profile,
// which does not identify the owner. `create_ag_by_dag_for_copy` does verify an owner wallet
// signature, but its SQL supports EVM signatures only, so it cannot prove a Stellar address either.
// So we refuse to derive an allow-list entry from a share and say so, rather than pretending the
// SEP-53 signature (which proves wallet control, not idOS ownership) is a binding.
export const WALLET_BINDING_UNAVAILABLE =
  "Credential verified. This app's idOS consumer cannot read the wallets registered to the credential owner, so the share cannot be bound to your Stellar address and no ASP allow-list entry was computed.";

export type CredentialReadResult = {
  verified: boolean;
  // Why verification did not pass (missing issuer config, bad signature, etc.), or on success why
  // the verified credential still yields no allow-list entry. Shown to the user verbatim.
  reason?: string;
  // A minimal, non-PII summary the UI can show. We never return the raw decrypted content.
  credentialType?: string;
  issuer?: string;
};

/**
 * Read a credential the user shared with this consumer (by its shared/DAG id), decrypt it with our
 * recipient key, and verify the issuer signature against the trusted issuer(s). The decryption
 * itself is the access-control gate: it only succeeds when the user actually granted this consumer,
 * so a caller cannot make us read an arbitrary credential. The access grant is then re-read from
 * idOS and must name this consumer as grantee and the copy's owner as grantor, and the content
 * must pass status/expiry/residency checks before the credential counts as verified. A verified
 * result is never a wallet binding (see WALLET_BINDING_UNAVAILABLE); callers must not treat it as one.
 */
export async function readSharedCredential(sharedCredentialId: string): Promise<CredentialReadResult> {
  const c = await consumer();

  // Decrypt the shared content. Throws if no grant to our consumer exists (crypto access gate).
  const contentJson = await c.getCredentialSharedContentDecrypted(sharedCredentialId);
  const credential = JSON.parse(contentJson);
  const credentialType = Array.isArray(credential?.type)
    ? credential.type.join(",")
    : typeof credential?.type === "string"
      ? credential.type
      : undefined;
  const issuer = typeof credential?.issuer === "string" ? credential.issuer : undefined;

  const issuers = acceptedIssuers();
  if (issuers.length === 0) {
    return {
      verified: false,
      reason: "No trusted issuer configured (IDOS_ACCEPTED_ISSUERS unset)",
      credentialType,
      issuer,
    };
  }

  // issuers is the SDK's AvailableIssuerType[]; our {issuer, publicKeyMultibase} is the CustomIssuerType
  // member of that union, cast through unknown since we build it from env JSON.
  const [ok] = await c.verifyCredential(credential, issuers as unknown as Parameters<typeof c.verifyCredential>[1]);
  if (!ok) {
    return { verified: false, reason: "Credential signature did not match a trusted issuer", credentialType, issuer };
  }

  // Grant binding: the copy row names its owner; the grant on it must be to OUR consumer identity
  // (the hex auth public key the client granted to) from that same owner.
  const [copy, grants] = await Promise.all([
    c.getCredentialSharedFromIDOS(sharedCredentialId),
    c.getAccessGrantsForCredential(sharedCredentialId),
  ]);
  const me = c.address.toLowerCase();
  const bound = Boolean(copy) && grants.some(
    (g) => g.ag_grantee_wallet_identifier.toLowerCase() === me && g.ag_owner_user_id === copy!.user_id,
  );
  if (!bound) {
    return { verified: false, reason: "No access grant from the credential owner to this consumer", credentialType, issuer };
  }

  const contentProblem = checkCredentialContent(credential, copy!.public_notes);
  if (contentProblem) return { verified: false, reason: contentProblem, credentialType, issuer };

  // Verified, and deliberately unbound: see WALLET_BINDING_UNAVAILABLE.
  return { verified: true, reason: WALLET_BINDING_UNAVAILABLE, credentialType, issuer };
}

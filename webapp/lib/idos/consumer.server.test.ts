import { describe, it, expect, beforeEach, vi } from "vitest";

// The address-binding decision for a shared idOS credential, with ONLY the SDK/network boundary
// mocked: @idos-network/consumer stands in for the playground kwil node, everything else (issuer
// config parsing, grant binding, content checks, the no-wallet-binding verdict) is the real code.
//
// What this pins down: a share that passes every check is still NOT a binding to a Stellar address,
// so no ASP allow-list entry may be derived from it. A leaked share id must buy nothing.
vi.mock("server-only", () => ({})); // Next build-time alias, unresolvable under vitest.

const sdk = vi.hoisted(() => ({
  // The consumer's own kwil identity (the hex auth public key users grant to).
  address: "299EDD683EC70703640B1A63B4DA4D8D96B1085E641D64F81D0FEA063412FD11",
  getCredentialSharedContentDecrypted: vi.fn(),
  getCredentialSharedFromIDOS: vi.fn(),
  getAccessGrantsForCredential: vi.fn(),
  verifyCredential: vi.fn(),
}));
vi.mock("@idos-network/consumer", () => ({ idOSConsumer: { init: async () => sdk } }));

const SHARE_ID = "11111111-2222-4333-8444-555555555555";
const OWNER = "99999999-8888-4777-8666-555555555555";
const ISSUER = { issuer: "did:example:issuer", publicKeyMultibase: "z6Mk-not-used-because-the-sdk-is-mocked" };
const credential = {
  type: ["VerifiableCredential", "KYCCredential"],
  issuer: ISSUER.issuer,
  approvedAt: "2026-01-01T00:00:00Z",
  expirationDate: "2099-01-01T00:00:00Z",
  credentialSubject: { residentialAddressCountry: "ID" },
};
const grant = (grantee: string, owner: string) => ({
  ag_grantee_wallet_identifier: grantee,
  ag_owner_user_id: owner,
});

// A 64-byte nacl.sign secret key is only length-checked, and the SDK that would use it is mocked.
process.env.IDOS_CONSUMER_SIGNER = Buffer.alloc(64, 7).toString("base64");
process.env.IDOS_RECIPIENT_ENC_PRIVATE_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.IDOS_ACCEPTED_ISSUERS = JSON.stringify([ISSUER]);

describe("readSharedCredential: a verified share is never a wallet binding", () => {
  beforeEach(() => {
    delete process.env.IDOS_DENY_COUNTRIES;
    sdk.getCredentialSharedContentDecrypted.mockResolvedValue(JSON.stringify(credential));
    sdk.getCredentialSharedFromIDOS.mockResolvedValue({
      user_id: OWNER,
      public_notes: JSON.stringify({ status: "approved" }),
    });
    sdk.getAccessGrantsForCredential.mockResolvedValue([grant(sdk.address.toLowerCase(), OWNER)]);
    sdk.verifyCredential.mockResolvedValue([true]);
  });

  it("verifies a good share but reports that it cannot be bound to a wallet", async () => {
    const { readSharedCredential, WALLET_BINDING_UNAVAILABLE } = await import("./consumer.server");
    const result = await readSharedCredential(SHARE_ID);
    expect(result.verified).toBe(true);
    expect(result.reason).toBe(WALLET_BINDING_UNAVAILABLE);
    // The verdict must stay explicit about the consequence, since /api/idos/credential prints it
    // and returns allowlist: null on the strength of it.
    expect(WALLET_BINDING_UNAVAILABLE).toMatch(/no ASP allow-list entry was computed/);
    // Nothing in the result names a wallet: there is no address to bind, by construction.
    expect(JSON.stringify(result)).not.toMatch(/\bG[A-Z2-7]{55}\b/);
  });

  it("still refuses a share whose grant is not from the owner to this consumer", async () => {
    const { readSharedCredential } = await import("./consumer.server");
    sdk.getAccessGrantsForCredential.mockResolvedValue([grant("someone-elses-consumer", OWNER)]);
    expect(await readSharedCredential(SHARE_ID)).toMatchObject({ verified: false, reason: /grant/ });
    // A grant to us, but recorded against a different owner than the copy row names.
    sdk.getAccessGrantsForCredential.mockResolvedValue([grant(sdk.address.toLowerCase(), "00000000-0000-4000-8000-000000000000")]);
    expect(await readSharedCredential(SHARE_ID)).toMatchObject({ verified: false, reason: /grant/ });
  });

  it("still refuses a bad issuer signature and bad content", async () => {
    const { readSharedCredential } = await import("./consumer.server");
    sdk.verifyCredential.mockResolvedValue([false]);
    expect(await readSharedCredential(SHARE_ID)).toMatchObject({ verified: false, reason: /trusted issuer/ });

    sdk.verifyCredential.mockResolvedValue([true]);
    process.env.IDOS_DENY_COUNTRIES = "ID";
    expect(await readSharedCredential(SHARE_ID)).toMatchObject({ verified: false, reason: /not accepted/ });
  });
});

// The canary for the fix we could NOT make: the day idOS ships a wallets read keyed by user id,
// this fails and the real binding (address must be one of the owner's registered wallets) becomes
// implementable. Runs against the installed package, not a mock.
describe("installed idOS kwil action set", () => {
  it("has no action that returns another user's wallets", async () => {
    const { actionSchema } = await import("@idos-network/kwil-infra/actions");
    const schema = actionSchema as Record<string, { name: string }[]>;
    const reads = Object.keys(schema).filter((a) => a.includes("wallet") && a.startsWith("get_"));
    expect(reads.sort()).toEqual(["get_wallet_with_balance", "get_wallets"]);
    // get_wallets takes no arguments: kwil scopes it to @caller, which server-side is this app's
    // consumer, never the credential owner. get_wallet_with_balance answers about the caller too.
    expect(schema.get_wallets).toEqual([]);
    expect(schema.get_wallet_with_balance.map((i) => i.name)).toEqual(["token"]);
    // The only address-keyed action answers a boolean about some profile, not which one.
    expect(schema.has_profile.map((i) => i.name)).toEqual(["address"]);
  });
});

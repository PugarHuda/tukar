// Plain Tukar constants (no SDK imports) — safe to pull into a light bundle (e.g. a
// server component that only needs the pool address for a link). lib/stellar.ts
// re-exports the public ones, so route code can import them from either module.
//
// NETWORK SELECTION (added 2026-09-11, never exercised against mainnet). Every value below that
// depends on which Stellar network the app talks to now comes out of the NETWORKS table instead of
// being written inline. NEXT_PUBLIC_STELLAR_NETWORK picks the entry; it defaults to "testnet",
// which is the only entry that has a deployment. Nothing else changed: every export keeps its name
// and, on testnet, its exact previous value, so every importer works unchanged.
//
// The mainnet entry is a SHAPE, not a deployment. Its contract ids are empty strings because Tukar
// has never been deployed to mainnet (see deployments/mainnet.json and docs/MAINNET-CHECKLIST.md).
// Selecting it throws at import time, which is deliberate: this module is imported by the client
// components, the API routes and the test suite alike, so a mainnet build fails immediately and
// loudly instead of half-working against contracts that do not exist.

export type StellarNetwork = "testnet" | "mainnet";

type NetworkConfig = {
  rpc: string;
  rpcFallback: string;
  passphrase: string;
  usdcIssuer: string;
  /** Read-only simulation source account (no signing). */
  source: string;
  /** Throwaway demo key, testnet only. A mainnet entry must never carry one. */
  demoSecret: string;
  anchor: { base: string; home: string };
  contracts: {
    pool: string;
    poolEnforced: string;
    disclosureVerifier: string;
    thresholdVerifier: string;
    aggregateVerifier: string;
    rangeVerifier: string;
    reflectorFx: string;
    policyRegistry: string;
    reserves: string;
    reservesVerifier: string;
    reservesAggregate: string;
  };
};

const NETWORKS: Record<StellarNetwork, NetworkConfig> = {
  testnet: {
    rpc: "https://soroban-testnet.stellar.org",
    // Second public testnet Soroban RPC (Ankr, no key, ~7 day ledger retention; verified live with
    // getHealth/getNetwork on 2026-08-29). lib/soroban/rpc.ts retries ONE request here when the
    // primary fails with a network error, timeout, or 5xx, then goes back to the primary next call.
    rpcFallback: "https://rpc.ankr.com/stellar_testnet_soroban",
    passphrase: "Test SDF Network ; September 2015",
    // Circle/SDF testnet USDC issuer (the pool's settlement asset, via its SAC).
    usdcIssuer: "GC7SWGHRQLMP4SW2AOBRSC2HFKVPNPHBH5A3PX3ZDVEJFMYKLWQ3SY3B",
    // Public key used only to build read-only simulation transactions.
    source: "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS",
    // Throwaway testnet demo key (non-admin, free testnet XLM only). Public on purpose so the
    // no-install demo can sign real testnet writes. NEVER reuse this pattern for real funds.
    demoSecret: "SALVZ6CF5CLAPV2FBPJ4SSW3QWCB6N2IPY4AEHQH4LKNWWNNVIGHN2KQ",
    // SEP anchor home (SDF testnet reference anchor). Swap this one object to a licensed anchor
    // to go live — the SEP-10/24 flow is byte-for-byte identical.
    anchor: { base: "https://testanchor.stellar.org", home: "testanchor.stellar.org" },
    contracts: {
      // Core pool + BN254 verifiers on Stellar testnet.
      pool: "CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ",
      // PREVIEW-TRACK enforced pool (parallel deploy, separate address): identical to POOL but
      // additionally enforces the per-corridor amount cap ON-CHAIN in withdraw — it reads the live
      // policy-registry cross-contract and reverts PolicyExceeded (#16) when the released whole-USDC
      // amount exceeds the corridor's cap_usdc. Nothing in the default path uses this; the live app
      // keeps using POOL. Override only via env for a preview build. Bootstrapped + e2e-verified live
      // (see deployments/testnet.json "poolEnforced"). Also gains an admin-only in-place `upgrade`.
      poolEnforced: "CBIGD4YLHXTUBBMRLK2BSWWGOMOFKR6EA6TFHFSIVH26PGFFDIHXRKTY",
      disclosureVerifier: "CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V",
      thresholdVerifier: "CDGOSIZQIMACRLIE76SQKKHUOKURGTGC4T2CKM2K62YP6463QR2KLHVR",
      aggregateVerifier: "CCTN437J4BX6S4JDMGUZFS2IEHV4ECHHK4ZLMM3N6VU5IIX2777AZJYA",
      rangeVerifier: "CDUONEVPPH7WI7EPSXZE3YXEF4FHHJM7HFJOTZBCJNJSUG26UMENUPQW",
      // Reflector — Stellar's decentralized SEP-40 FX oracle (testnet, base = USD).
      reflectorFx: "CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W",
      // Per-corridor policy registry (additive, separate from the 8 live contracts): stores the
      // per-jurisdiction amount cap + required-disclosure mode as REAL on-chain records the
      // operator console reads live. Admin is the corridor operator key (SOURCE); re-pointed by
      // admin-signed set_policy (no redeploy).
      policyRegistry: "CAQ7KBNFJOJI34B5V3GNI7ACW6YEOAD4JRYSOX3EUW5UOXFKBDZBDAZ3",
      // Proof-of-reserves (additive, read-only over the live pool; not one of the 8 live contracts):
      // RESERVES.attest reads the pool's balance() + leaves() cross-contract, rebuilds the reserves
      // circuit's public inputs from the on-chain leaves, verifies a Groth16 proof that the note
      // openings sum to a declared-liabilities figure, and refuses unless liabilities <= custody.
      // reservesVerifier is the 10th BN254 verifier (reserves circuit VK). The operator console
      // reads latest_attestation()/is_solvent() live.
      reserves: "CCMIHWMVDTO6X4FPJSHXEQBYQQID3QIKCLMNVS5UKMPRHWLPUK4ALXMC",
      reservesVerifier: "CBCVFPJBKVWACXQMVTWK5LO7UVABUKVAE2EYERGTSXO4ZTHFAT2VD5JI",
      // VOLUNTARY proof-of-reserves (additive, read-only over the live pool; not one of the 8 live
      // contracts). REUSES the deployed aggregate-disclosure verifier (no new circuit/ceremony):
      // each depositor proves a sum over THEIR OWN notes into a shared round (prove sum <= cap using
      // the aggregate circuit, cap = disclosed_sum), the contract accumulates the proven liabilities
      // and compares against live custody. proven_liabilities is an HONEST LOWER BOUND covering only
      // the notes that have attested (M of N) — it grows as more depositors opt in, needing no
      // redeploy of the live pool (which cannot hold all openings). This points at the LIVE pool;
      // the operator console reads its views live.
      reservesAggregate: "CA6Q5SWRAV3P432YNL4OE6IZ52LNBBS5WWE2HILDYRZDGFBY47PKC7XN",
    },
  },
  // NOTHING IS DEPLOYED HERE. Every field an address would go in is empty on purpose, and the guard
  // below turns that emptiness into a refusal. Do not fill any of these in from memory or with a
  // stand-in value: an id here is a claim that a contract exists at it. The deployment record this
  // mirrors is deployments/mainnet.json; the work that has to happen first, in this repository's
  // own terms, is docs/MAINNET-CHECKLIST.md.
  mainnet: {
    // SDF runs no free public mainnet Soroban RPC, so this is a provider endpoint chosen at deploy
    // time rather than a well-known URL. Left blank instead of guessed.
    rpc: "",
    rpcFallback: "",
    // The one mainnet value that is public, fixed, and not a claim about a Tukar deployment.
    passphrase: "Public Global Stellar Network ; September 2015",
    // Circle publishes the mainnet USDC issuer. Left blank so that no address in this file is
    // transcribed from memory; copy it from Circle at deploy time.
    usdcIssuer: "",
    source: "",
    // Stays empty permanently. A mainnet bundle must never ship an embedded signing key.
    demoSecret: "",
    anchor: { base: "", home: "" },
    contracts: {
      pool: "",
      poolEnforced: "",
      disclosureVerifier: "",
      thresholdVerifier: "",
      aggregateVerifier: "",
      rangeVerifier: "",
      reflectorFx: "",
      policyRegistry: "",
      reserves: "",
      reservesVerifier: "",
      reservesAggregate: "",
    },
  },
};

/** Which network this build talks to. Defaults to testnet, the only network Tukar is deployed on. */
export const NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet").trim().toLowerCase() as StellarNetwork;

/**
 * Resolve a network entry, or throw. Fails at import time rather than at the first RPC call, so a
 * misconfigured target cannot half-work. Exported so a test can exercise the refusal directly and
 * so a deploy script can check a target before it does anything.
 */
export function resolveNetwork(name: string): NetworkConfig {
  const net = NETWORKS[name as StellarNetwork];
  if (!net) {
    throw new Error(
      `Tukar: unknown Stellar network "${name}". Configured networks: ${Object.keys(NETWORKS).join(", ")}. ` +
        "Set NEXT_PUBLIC_STELLAR_NETWORK=testnet (the default).",
    );
  }
  const missing = [
    ["rpc", net.rpc],
    ["usdcIssuer", net.usdcIssuer],
    ["source", net.source],
    ...Object.entries(net.contracts),
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `Tukar is not deployed on "${name}": ${missing.length} required value(s) are empty (${missing.join(", ")}). ` +
        "No contract has ever been deployed to mainnet, so the app refuses to start against it rather than " +
        "half-working against contracts that do not exist. See deployments/mainnet.json and " +
        "docs/MAINNET-CHECKLIST.md. Set NEXT_PUBLIC_STELLAR_NETWORK=testnet (the default).",
    );
  }
  return net;
}

const NET = resolveNetwork(NETWORK);

export const RPC = NET.rpc;
export const RPC_FALLBACK = NET.rpcFallback;
// Per-request ceiling for every rpc.Server we create (the SDK default is 0 = wait forever). A
// healthy testnet call answers in well under 2 s; 30 s only ever fires on a dead network.
export const RPC_TIMEOUT_MS = 30_000;
export const USDC_ISSUER = NET.usdcIssuer;
export const PASSPHRASE = NET.passphrase;

// BN254 scalar field modulus (reduce ext-data keccak / address field into a field element).
export const FIELD_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const POOL = NET.contracts.pool;
export const POOL_ENFORCED = process.env.NEXT_PUBLIC_POOL_ENFORCED || NET.contracts.poolEnforced;
export const DISCLOSURE_VERIFIER = NET.contracts.disclosureVerifier;
export const THRESHOLD_VERIFIER = NET.contracts.thresholdVerifier;
export const AGGREGATE_VERIFIER = NET.contracts.aggregateVerifier;
export const RANGE_VERIFIER = NET.contracts.rangeVerifier;
export const REFLECTOR_FX = NET.contracts.reflectorFx;
export const POLICY_REGISTRY = NET.contracts.policyRegistry;
export const RESERVES = NET.contracts.reserves;
export const RESERVES_VERIFIER = NET.contracts.reservesVerifier;
export const RESERVES_AGGREGATE = NET.contracts.reservesAggregate;

export const SOURCE = NET.source;
export const DEMO_SECRET = NET.demoSecret;
export const ANCHOR = NET.anchor;

// Onramper — licensed off-ramp aggregator (public docs key; fine for demo/testnet). Not network
// scoped: the widget host is the same everywhere and the key is a published demo key.
export const ONRAMPER = { apiKey: "pk_prod_01HETEQF46GSK6BS5JWKDF31BT", api: "https://api.onramper.com", widget: "https://buy.onramper.com" };

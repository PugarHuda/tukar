// Plain Tukar constants (no SDK imports) — safe to pull into a light bundle (e.g. a
// server component that only needs the pool address for a link). lib/stellar.ts
// re-exports the public ones, so route code can import them from either module.

export const RPC = "https://soroban-testnet.stellar.org";
export const PASSPHRASE = "Test SDF Network ; September 2015";

// BN254 scalar field modulus (reduce ext-data keccak / address field into a field element).
export const FIELD_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Core pool + BN254 verifiers on Stellar testnet.
export const POOL = "CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ";

// PREVIEW-TRACK enforced pool (parallel deploy, separate address): identical to POOL but
// additionally enforces the per-corridor amount cap ON-CHAIN in withdraw — it reads the live
// policy-registry cross-contract and reverts PolicyExceeded (#16) when the released whole-USDC
// amount exceeds the corridor's cap_usdc. Nothing in the default path uses this; the live app
// keeps using POOL. Override only via env for a preview build. Bootstrapped + e2e-verified live
// (see deployments/testnet.json "poolEnforced"). Also gains an admin-only in-place `upgrade`.
export const POOL_ENFORCED = process.env.NEXT_PUBLIC_POOL_ENFORCED || "CBIGD4YLHXTUBBMRLK2BSWWGOMOFKR6EA6TFHFSIVH26PGFFDIHXRKTY";
export const DISCLOSURE_VERIFIER = "CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V";
export const THRESHOLD_VERIFIER = "CDGOSIZQIMACRLIE76SQKKHUOKURGTGC4T2CKM2K62YP6463QR2KLHVR";
export const AGGREGATE_VERIFIER = "CCTN437J4BX6S4JDMGUZFS2IEHV4ECHHK4ZLMM3N6VU5IIX2777AZJYA";
export const RANGE_VERIFIER = "CDUONEVPPH7WI7EPSXZE3YXEF4FHHJM7HFJOTZBCJNJSUG26UMENUPQW";

// Reflector — Stellar's decentralized SEP-40 FX oracle (testnet, base = USD).
export const REFLECTOR_FX = "CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W";

// Per-corridor policy registry (additive, separate from the 8 live contracts): stores the
// per-jurisdiction amount cap + required-disclosure mode as REAL on-chain records the
// operator console reads live. Admin is the corridor operator key (SOURCE); re-pointed by
// admin-signed set_policy (no redeploy).
export const POLICY_REGISTRY = "CAQ7KBNFJOJI34B5V3GNI7ACW6YEOAD4JRYSOX3EUW5UOXFKBDZBDAZ3";

// Proof-of-reserves (additive, read-only over the live pool; not one of the 8 live contracts):
// RESERVES.attest reads the pool's balance() + leaves() cross-contract, rebuilds the reserves
// circuit's public inputs from the on-chain leaves, verifies a Groth16 proof that the note
// openings sum to a declared-liabilities figure, and refuses unless liabilities <= custody.
// RESERVES_VERIFIER is the 10th BN254 verifier (reserves circuit VK). The operator console
// reads latest_attestation()/is_solvent() live.
export const RESERVES = "CCMIHWMVDTO6X4FPJSHXEQBYQQID3QIKCLMNVS5UKMPRHWLPUK4ALXMC";
export const RESERVES_VERIFIER = "CBCVFPJBKVWACXQMVTWK5LO7UVABUKVAE2EYERGTSXO4ZTHFAT2VD5JI";

// VOLUNTARY proof-of-reserves (additive, read-only over the live pool; not one of the 8 live
// contracts). REUSES the deployed aggregate-disclosure verifier (no new circuit/ceremony):
// each depositor proves a sum over THEIR OWN notes into a shared round (prove sum <= cap using
// the aggregate circuit, cap = disclosed_sum), the contract accumulates the proven liabilities
// and compares against live custody. proven_liabilities is an HONEST LOWER BOUND covering only
// the notes that have attested (M of N) — it grows as more depositors opt in, needing no
// redeploy of the live pool (which cannot hold all openings). This RESERVES_AGGREGATE points at
// the LIVE pool; the operator console reads its views live (proven_liabilities / covered M-of-N /
// balance / solvent-for-covered).
export const RESERVES_AGGREGATE = "CA6Q5SWRAV3P432YNL4OE6IZ52LNBBS5WWE2HILDYRZDGFBY47PKC7XN";

// Public key used only to build read-only simulation transactions.
export const SOURCE = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS";

// Throwaway testnet demo key (non-admin, free testnet XLM only). Public on purpose so the
// no-install demo can sign real testnet writes. NEVER reuse this pattern for real funds.
export const DEMO_SECRET = "SALVZ6CF5CLAPV2FBPJ4SSW3QWCB6N2IPY4AEHQH4LKNWWNNVIGHN2KQ";

// SEP anchor home (SDF testnet reference anchor). Swap this one object to a licensed anchor
// to go live — the SEP-10/24 flow is byte-for-byte identical.
export const ANCHOR = { base: "https://testanchor.stellar.org", home: "testanchor.stellar.org" };

// Onramper — licensed off-ramp aggregator (public docs key; fine for demo/testnet).
export const ONRAMPER = { apiKey: "pk_prod_01HETEQF46GSK6BS5JWKDF31BT", api: "https://api.onramper.com", widget: "https://buy.onramper.com" };

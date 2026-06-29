# Alternatives to externally-gated integrations

A few "deepen the ecosystem integration" opportunities normally require an external,
gated resource — a Launchtube API token, a Mercury account, a WebAuthn authenticator,
or a KYC'd anchor partner — none of which can be obtained or live-verified inside this
build/CI environment. Rather than ship an unverifiable stub (which the project's
no-fakes rule forbids), this doc records, for each one, the **native Stellar
alternative**, whether it's been **built and live-verified**, and the honest ceiling.

| Opportunity | Native alternative | Status |
|---|---|---|
| Launchtube paymaster (gasless) | **Fee-bump transactions (CAP-15)** | ✅ Built + live-verified on testnet |
| Mercury durable indexing | **Durable-contract-state reconstruction** | ✅ Already implemented (better for the accumulator) |
| Passkey smart-wallet | **`secp256r1_verify` host fn** / ephemeral per-visitor key | ◑ Buildable; full UX needs a human authenticator |
| SEP-24 anchor (fiat ramp) | **SEP-10 web-auth** against the public testanchor | ◑ Handshake buildable; SEP-24 ramp needs a partner |

---

## 1. Launchtube → native fee-bump (CAP-15) — DONE, live-verified

A paymaster service like Launchtube exists so a user needs no XLM for transaction
fees: a relayer pays them. Stellar has this natively. A **fee-bump transaction** wraps
an inner transaction *authorized and signed by the user* and lets a separate **fee
source** account pay the entire network fee. No gated API token; pure protocol.

Because a fee-bump is an envelope around *any* inner transaction, it applies unchanged
to the corridor's Soroban `deposit`/`withdraw` invokes: a Freighter user signs the
inner invoke, the app's relayer pays the fee — gasless deposits/withdrawals.

**Proven on testnet** (`scripts/feebump-paymaster.mjs`, `npm run demo:feebump`): a
transaction signed by the demo key had its entire fee paid by a fresh, independent
paymaster account — `paymasterPaidXlm: 0.00002`, `signerDeltaXlm: 0` (the signer paid
nothing). Example tx: `ef9c15065b469e648839dc56639f8712fc029d450c59b188b3c7f434bc06a6a6`.

Remaining step to ship it in the UI: wrap the Freighter-signed inner invoke with this
fee-bump (demo key as relayer). That path is a few lines on top of the verified
primitive, but — like the Freighter signing path itself — it can only be exercised
end-to-end by a human with the extension, so it's documented rather than claimed.

## 2. Mercury → durable contract state — already solved, no external dep

Mercury is a hosted indexer for reconstructing state from contract events. Tukar does
not need it for its load-bearing path: the spendable Merkle tree is reconstructed from
**durable contract storage** (`leaves()` / `leaf_range(start,count)` / `leaf_count`),
which has **no event-retention dependency** — strictly more reliable than indexing
events, which testnet RPC ages out after ~10k ledgers. The on-chain `getEvents`
activity feed (`readRecentActivity`) is a best-effort *recent* view layered on top,
explicitly not a source of truth. A production deploy could point that feed at a
Mercury subscription for durable history, but the accumulator never relies on it.

## 3. Passkey smart-wallet → `secp256r1_verify` / ephemeral keys — partially buildable

The "shared public demo key" caveat (the no-install demo isn't access-controlled)
would be closed by a passkey-controlled smart wallet. Two native angles:

- **On-chain capability is real:** Stellar's `secp256r1_verify` host function (the
  primitive WebAuthn smart wallets verify against) is available on Soroban, so a
  smart-wallet contract that authenticates a passkey signature is buildable and
  **unit-testable in Rust with a known P-256 keypair** — no authenticator needed to
  prove the on-chain half works (the same way on-chain Poseidon was proven by unit
  test without putting it on the hot path).
- **Closing the caveat today without WebAuthn:** generate an **ephemeral keypair per
  visitor** in the browser and friendbot-fund it (the `wallet.js` testnet-setup flow
  already does friendbot + USDC trustline + faucet), instead of one shared key. Fully
  native and verifiable; the trade-off is added page-load latency from per-visitor
  funding, so it's left as a deliberate UX choice rather than forced on the demo.

The browser WebAuthn UX itself (registration/assertion) genuinely needs a human
authenticator and can't run in headless CI — same limitation already documented for
Freighter.

## 4. SEP-24 anchor → SEP-10 web-auth — handshake buildable, ramp needs a partner

A real fiat on/off-ramp at the corridor edges is a SEP-24 interactive flow, which
requires a KYC'd anchor partner (business/legal, out of scope for a code-only build).
But the **SEP-10 web-authentication** handshake — GET a challenge transaction, sign it,
POST it back for a JWT — is a real anchor-protocol integration that can be built and
verified against the **public SDF testanchor** (`testanchor.stellar.org`) with no KYC.
That demonstrates the auth half of the anchor relationship; the SEP-24 deposit/withdraw
ramp stays honestly mocked (as stated in the README/ARCHITECTURE) until a partner
exists. We chose not to add SEP-10 in isolation because the JWT it yields has nothing
to authorize in this product without the SEP-24 ramp behind it.

---

**Bottom line:** the one opportunity with a clean native substitute that is also
fully live-verifiable — gasless via fee-bump — is built and proven. The rest are
either already obviated by a better design (Mercury) or genuinely gated on a human
authenticator / KYC partner, with the buildable sub-parts noted honestly.

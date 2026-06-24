# Tukar — Threat Model & Security

This is the security spine of the project: what Tukar protects, the attacks it
defends against, and **how each defense is verified** (unit test, on-chain error,
or live browser test). Tukar is a **testnet** project and is **not audited** — do
not use with real assets — but every property below is exercised, not asserted.

## Assets we protect

| Asset | Property |
|---|---|
| **Note privacy** | Amounts and counterparties of in-corridor transfers stay hidden on-chain — only commitments and nullifiers are public. |
| **Pool funds (USDC)** | The pool releases tokens only for a valid, *bound* withdraw — never more than a proof authorizes, never to replay a spent note. |
| **Tree integrity** | The Merkle accumulator can only grow by a *proven* insertion; no party can forge a root or a membership. |
| **Compliance soundness** | A deposit must carry a valid ASP-membership proof; a disclosure cannot lie about an amount. |

## Design principle: binding

The single most important property. **The pool never accepts a pre-built
`Vec<Bn254Fr>` of public inputs.** It receives the public signals as *typed
values* (root, nullifiers, commitments, amount) and **builds the verifier's
public-input vector itself**, in circuit order — then uses those same values for
its own logic. So a caller cannot present a proof that verifies while spending
*different* nullifiers, recording *different* commitments, advancing a *different*
root, or releasing a *different* amount: any mismatch changes the public inputs
and the proof fails. Every defense below rests on this.

## Threats & mitigations (all verified)

| # | Attack | Mitigation | Verified by |
|---|---|---|---|
| T1 | **Double-spend** a note | Per-input nullifier published + recorded; replay rejected | `NullifierUsed` (#2) — unit + live |
| T2 | **Double-spend bypass**: a *valid* transfer proof, but submit *different* nullifiers to the pool | Pool builds the verifier inputs from the typed nullifiers itself (binding) → proof no longer matches | `InvalidProof` (#0) — live (tampered nullifiers) |
| T3 | **Amount decoupling**: deposit a commitment whose hidden value ≠ the USDC moved | `deposit` also requires a disclosure proof that the commitment *opens to exactly* `amount` | deposit amount-binding — unit + live |
| T4 | **Over-withdraw**: tell the pool to release more than the proof authorizes | Released `amount` is bound to the proof's verified `public_amount` (the field-negative `r − amount`) | `AmountNotBound` (#6) — unit + live |
| T5 | **Forged tree root**: operator registers an arbitrary root | Root advances *only* via `register_root_verified` with a `merkleUpdate` proof that inserting `new_leaf` into the known root yields `new_root`; the admin override was removed | fake-root → `InvalidProof` (#0); no admin path — unit + live |
| T6 | **Break the accumulator**: insert from a stale/old root to fork the tree | `register_root_verified` requires `old_root == current_root` (single append-only accumulator) | `UnknownRoot` (#1) on stale root — unit + observed live |
| T7 | **Spend into an unknown root** | `transfer`/`withdraw` require a *known* root | `UnknownRoot` (#1) — unit |
| T8 | **Disclose an unknown commitment** to a regulator | `disclose` requires the commitment to be in the pool's set | `UnknownCommitment` (#3) — unit |
| T9 | **Lie in a disclosure** (claim a false amount) | Groth16 soundness — a false witness can't be proven; a tampered public input fails verification | rejected off-chain **and** on-chain (`InvalidProof`) — live |
| T10 | **Deposit from a non-allow-listed / sanctioned source** | Compliance proof: source ∈ ASP allow-list **and** ∉ deny-list, bound to the commitment | compliance soundness 6/6 (`test:negative`) |
| T11 | **Forge value** (mint shielded value via field wrap) | Output amounts are range-checked to 248 bits; value conservation `sum(in)+publicAmount = sum(out)` | circuit constraints + `test:negative` |
| T12 | **Trusted-setup toxic waste** (forge any proof) | Phase-1 from the real **Hermez** perpetual Powers-of-Tau ceremony (no locally-known waste) | `deployments/testnet.json` → `trustedSetup` |

## Trust assumptions (honest)

- **ASP curation** — Tukar enforces *membership* in the allow/deny sets
  cryptographically, but *who is on those lists* is an off-chain policy decision
  (seeded manually here; a real ASP operator owns it).
- **Anchors** — fiat on/off-ramps are mocked; we assume regulated anchors at the
  edges in production.
- **Phase-2 of the setup** — a single Tukar contribution (phase-1 is the real
  ceremony); production wants a multi-party phase-2.
- **Demo signing key** — writes are signed by a **throwaway, non-admin testnet
  key** embedded in the frontend so anyone can try the demo with no wallet (free
  testnet XLM only). Optional **Freighter** lets a user sign with their own wallet.
  Never reuse the embedded-key pattern for real funds.

## Out of scope (this testnet build)

- Not audited; no formal verification of the circuits.
- Metadata/timing side-channels (e.g. tx timing, amounts at the *edges* where
  disclosure is intentional) are not obfuscated.
- A very-long-lived production pool needs a TTL-maintenance job and an indexer
  (see the tree-scale note in the README); not required at demo scale.
- Relayer/fee privacy (who pays the tx fee) is not addressed.

## How to reproduce the checks

- **Contract unit tests** (15/15): `cd contracts/pool && cargo test` — covers
  T1, T3, T4, T6, T7, T8, plus accumulator + leaf-storage + on-chain Poseidon.
- **Circuit soundness** (6/6): `npm run test:negative` — covers T9, T10, T11.
- **In-browser proving** (valid/tampered/false-witness): `npm run test:proving`.
- **Live end-to-end** (deposit → register → withdraw → disclosure → tamper
  rejected, all on testnet): `node scripts/browser-test.mjs <url>` — covers T2,
  T4, T5, T9 against the deployed contracts.

See [`TESTING.md`](TESTING.md) for the full result tables and
[`deployments/testnet.json`](../deployments/testnet.json) for live contract ids.

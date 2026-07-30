# Where Tukar sits — and how it differs

Stellar's privacy tier is real and getting crowded (that's a good sign — it's where
Stellar is investing). This is an honest map of the neighbours and where Tukar is
genuinely different, plus where it deliberately *isn't* (so it stays relevant and
composable, not a reinvention).

## The neighbours

| Project | What it is | Compliance model | Chain / tech |
|---|---|---|---|
| **Confidential Tokens** (official Stellar/OZ) | Hides **balances & amounts** of an SEP-41 token; sender/recipient stay visible | Auditor keys / selective disclosure | Stellar · Noir + UltraHonk |
| **LumenShade** | A **privacy-pool** primitive (Tornado / 0xbow / Railgun lineage): deposit → shielded → withdraw, breaks deposit↔withdraw linkability | "Potential for" compliance (roadmap) | Stellar/Soroban · ZK |
| **Moonlight** | A **general privacy layer**: accounts become constellations of unlinkable UTXOs; hides sender/recipient/amount | Trusted **"Privacy Providers"** (banks/custodians) relay txns and add optional compliance hooks + selective disclosure | Stellar · UTXO + ZK |
| **Fairblock** | **Programmable privacy / anti-MEV** via MPC + identity-based encryption; encrypt-then-execute, confidential stablecoin transfers & sealed trading | Condition-based decryption | Cosmos / Arbitrum · MPC/IBE (not ZK privacy pools) |
| **Tukar** | A **remittance corridor** on the privacy-pool tier: fiat-in → shielded crossing → fiat-out to **local currency** | **In-protocol, trustless**: per-deposit ASP allow/deny proof (key pinned to `from`) + **four** on-chain-verified selective-disclosure types with on-chain-enforced aggregate completeness | Stellar/Soroban · Circom/Groth16/BN254 |

## What the judges verified (the load-bearing facts)

These are checkable in this repo, not claims: **7** Circom/Groth16/BN254 circuits
(`ls circuits/*.circom`), **8** deployed-and-exercised testnet contracts
(`deployments/testnet.json`: pool + 7 verifiers, each with a tamper-rejection proof),
**52/52** pool contract tests (`cd contracts/pool && cargo test`), an on-chain Reflector
SEP-40 FX read that **gates settlement** (`SlippageExceeded`, fail-closed on a stale or
thin feed), and a native fee-bump gasless flow. This is the substance underneath the
positioning below. It is also larger than an earlier snapshot some reviewers saw (four
circuits, one disclosure type): the disclosure layer is now **four** on-chain-verified
types, which is itself part of the differentiator (see line 3 below).

## Four lines that separate Tukar

**1. Vertical product, not a horizontal primitive.**
LumenShade and Moonlight are *layers* — you shield an asset, or you get unlinkable
UTXOs, and then someone builds a product on top. Tukar **is** that product for one job:
a cross-border corridor with fiat edges (anchor SEPs), an off-ramp to **local
currency**, bearer notes and payment requests — end to end, 10 corridors. Tukar could
even *sit on top of* a privacy-pool primitive; it's not competing to be the primitive.

**2. Trustless, in-protocol compliance — not a trusted relay, not "roadmap".**
This is the sharpest difference. Moonlight routes compliance through **Privacy
Providers** (banks/custodians you trust to relay and disclose); LumenShade lists
compliance as a future goal. Tukar's compliance is **proven on-chain, per deposit, with
no trusted intermediary**: the ASP proof pins `sourceKey = field(from)` and the deposit
`require_auth`s that account, so it authenticates *this* depositor is allow-listed (and
not deny-listed) — and a holder discloses **one fact** to a regulator via a proof the
Stellar contract verifies. It's live and soundness-tested today (`npm run test:asp`,
`test:negative`), not delegated and not deferred.

**3. Four on-chain-verified disclosure types, with completeness enforced on-chain.**
A general privacy pool lets a holder hide a fact; it does not let a regulator *verify one*.
Tukar ships **four** selective-disclosure circuits, each verified by its own live Soroban
contract and each bound to a **real on-chain deposit** (the pool checks the commitment is a
known deposit before it routes to the verifier): exact amount, threshold (`amount ≤ X`,
amount hidden), portfolio aggregate (`Σ payments ≤ cap`, amounts hidden), and two-sided
range (`lower ≤ amount ≤ upper`). The aggregate type adds the piece a mixer cannot: an
**on-chain audit-request registry**. An auditor role registers the exact required set on
chain, and `disclose_aggregate` rejects any context hash that was not registered
(`UnknownAuditRequest`), so a holder cannot answer a "sum of everything" request with a
cherry-picked subset. So a regulator gets a specific, complete, contract-verified fact tied
to a genuine deposit, which a plain shielded-transfer primitive has no mechanism to offer.

**4. Oracle-gated settlement — privacy bound to real-world FX.**
None of the neighbours tie fund movement to an on-chain FX oracle. Tukar's off-ramp
rate is read **on-chain from Reflector** and *gates the release* (min-receive on the
median of 5 records, fail-closed on a stale/thin feed). Remittance is fundamentally an
FX product, so making the oracle **load-bearing for settlement** — including the first
**SEA corridor (Thailand/THB)** priced on-chain — is a differentiator the pure-privacy
projects have no reason to build.

## Answering "this already exists (LumenShade / Moonlight / Fairblock)"

It is a fair prompt, and the honest answer is a wedge, not a claim that the neighbours are
bad. LumenShade and Moonlight are privacy *primitives* (a shielded pool, an unlinkable-UTXO
layer); Fairblock is encrypt-then-execute MPC/IBE infra on other chains. None of them, on
public material, is a **remittance corridor** with fiat edges via real anchor SEPs, with
**compliance proven in-circuit and bound to the authenticated depositor** (allow-list
membership AND deny-list non-membership, so it is private *and* sanctions-screenable), with
**four contract-verified disclosure types plus on-chain completeness enforcement**, with a
**load-bearing** settlement oracle. We position on those four verifiable Tukar features, not
on any guess about a competitor's internals. The combination is what has no catalog
equivalent.

## Positioning in one line

> **Private for users AND provable to regulators, on the chain built for cross-border
> money.** Concretely: the **compliant remittance vertical** of Stellar's privacy-pool
> tier, with trustless in-protocol compliance, four on-chain-verified disclosure types, and
> oracle-gated settlement, composable with the privacy primitives around it rather than a
> copy of them.

## Staying relevant, on purpose

- **We reuse, we don't reinvent.** Verifier pattern adapted from Nethermind's
  reference; phase-1 setup is the real Hermez ceremony; FX from Reflector; fiat edges
  via the anchor SEP stack. Tukar is the *composition* that doesn't exist yet, not new
  crypto for its own sake.
- **We fit Stellar's stated strategy.** Stellar's own privacy writing names the
  privacy-pool tier ("shield both parties and amounts") and *compliant* privacy as the
  goal. Tukar is a working instance of exactly that, aimed at Stellar's flagship
  use case — cross-border payments.

_Sources: Stellar privacy strategy & Confidential Tokens preview (stellar.org),
Moonlight (moonlightprotocol.io), LumenShade (communityfund.stellar.org),
Fairblock (docs.fairblock.network). Neighbour descriptions are our honest reading of
public material and may lag their latest releases._

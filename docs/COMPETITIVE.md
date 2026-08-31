# Where Tukar sits — and how it differs

Stellar's privacy tier is real and getting crowded (that's a good sign — it's where
Stellar is investing). This is an honest map of the neighbours and where Tukar is
genuinely different, plus where it deliberately *isn't* (so it stays relevant and
composable, not a reinvention).

## Category: Payments & Consumer Applications

Tukar is entered in the **Payments & Consumer Applications** category of the Stellar
APAC Grand Finale. It fits there directly: it is a **consumer remittance app** (send
money home to family) with mobile-first Sender and Receiver experiences and real fiat
in and out. The privacy and compliance layer is the moat, not the category. So the
map below has two kinds of neighbour: the **privacy-tier projects** (Confidential
Tokens, LumenShade, Moonlight, Fairblock) that share Tukar's tech, and the
**in-category rivals** (other payments and consumer apps) it is judged against.

## The neighbours

| Project | What it is | Compliance model | Chain / tech |
|---|---|---|---|
| **Confidential Tokens** (official Stellar/OZ) | Hides **balances & amounts** of an SEP-41 token; sender/recipient stay visible | Auditor keys / selective disclosure | Stellar · Noir + UltraHonk |
| **LumenShade** | A **privacy-pool** primitive (Tornado / 0xbow / Railgun lineage): deposit → shielded → withdraw, breaks deposit↔withdraw linkability | "Potential for" compliance (roadmap) | Stellar/Soroban · ZK |
| **Moonlight** | A **general privacy layer**: accounts become constellations of unlinkable UTXOs; hides sender/recipient/amount | Trusted **"Privacy Providers"** (banks/custodians) relay txns and add optional compliance hooks + selective disclosure | Stellar · UTXO + ZK |
| **Fairblock** | **Programmable privacy / anti-MEV** via MPC + identity-based encryption; encrypt-then-execute, confidential stablecoin transfers & sealed trading | Condition-based decryption | Cosmos / Arbitrum · MPC/IBE (not ZK privacy pools) |
| **Tukar** | A **remittance corridor** on the privacy-pool tier: fiat-in → shielded crossing → fiat-out to **local currency** | **In-protocol, trustless**: per-deposit ASP allow/deny proof (key pinned to `from`) + **four** on-chain-verified selective-disclosure types with on-chain-enforced aggregate completeness | Stellar/Soroban · Circom/Groth16/BN254 |

## In-category rivals (Payments & Consumer Applications)

These are the apps Tukar is judged beside, not privacy primitives. Positioning is on
Tukar's own verifiable features, not any guess about their internals.

| Rival | What it is (public read) | Where Tukar differs |
|---|---|---|
| **Veil** | A **ZK privacy pool / mixer** on Stellar, private-by-default | Veil is private but, on public material, has **no compliance layer**. Tukar is the **compliant** version: ASP allow/deny proven **in-circuit** and bound to the authenticated depositor, plus **four** on-chain-verified selective-disclosure types a regulator can check. Tukar is also a **cross-border corridor with fiat edges**, not a bare pool. |
| **OLIO** | **Private USDC payment links**, freelancer-focused | OLIO is a private-payment tool for a different job (getting paid via a link). Tukar is **cross-border remittance** with fiat-in/fiat-out to **local currency**, an on-chain FX oracle gating settlement, and a **regulator-verifiable** disclosure layer. Different user, different edges. |
| **Palengke-pay, Pundar, Pacta, Family Haven, StarTip, Human FX, Payoes** | Consumer wallets / payments plays (send, tip, remit, FX) | These are consumer money apps without an on-chain privacy + compliance layer (on public material). Tukar adds **privacy AND provable compliance** to cross-border money: the payment graph is hidden on-chain, yet a regulator can verify a single fact via on-chain selective disclosure. That combination is the wedge. |

Honest framing for judges: vs the **privacy pools/mixers** (Veil, and the LumenShade
tier below), Tukar's edge is **compliance** (allow/deny in-circuit plus four
contract-verified disclosure types) and being a **real remittance corridor with fiat
edges**. Vs the **consumer wallets**, Tukar's edge is adding **privacy + compliance**
to cross-border money. We do not claim to know any rival's internals beyond what is
public, and these descriptions may lag their latest releases.

## Concept-siblings at the same hackathon (Stellar Hacks: Real-World ZK)

Tukar placed **5th** at Stellar Hacks: Real-World ZK. Being honest about that event
matters, because the "compliant privacy pool" theme was crowded there. Several projects
shipped the same core idea (a shielded pool plus a compliance gate). We list them with
public one-liners only and do not claim to know their internals.

| Project | Public one-liner |
|---|---|
| **Wraith** | "ZK Privacy on Stellar". Placed 1st ($5k). |
| **AnchorShield** | Proves KYC, sanctions-clearance, and eligibility without doxxing the user. Placed 2nd ($2k). |
| **Veil** | "Compliant private payments; mixers get sanctioned, Veil breaks the trade-off". |
| **Shroud** | Compliant privacy pool with an Association Set Provider (ASP) gateway. |
| **EclipsePrivacy** | Compliant USDC privacy pool, Groth16/BN254. |
| **Compliant Privacy Pool** | Private stablecoin transfers tied to a live allow-list. |
| **Zebra / ZeroWage** | Compliant ZK payroll. |

**Honest takeaway.** The core "privacy pool plus compliance" idea is **not unique**, and
we should stop positioning on it as if it were. Tukar's real differentiation is the parts
these siblings do not build: the full **remittance corridor** (real fiat edges via SEP
anchors, an oracle-gated off-ramp to local currency, four contract-verified disclosure
types, and an on-chain audit registry), plus the **anchor-layer positioning** (Tukar as
the layer a licensed anchor plugs into), a working **OpenVASP TRP 3.2.1 Travel Rule
exchange** with signatures verified on receipt, cryptographic **full-pool proof-of-reserves**,
and **compliance policy stored on-chain per corridor**. Everything above the pool is the moat,
not the pool.

## Mature live rivals in the Stellar directory (SCF-funded, Live)

These are past the hackathon stage. They are shipped, funded products, so they are a
sterner comparison than a weekend build.

| Project | What it is (public) | Where Tukar differs |
|---|---|---|
| **Moonlight** | Non-custodial privacy on Stellar using ZK proofs while preserving compliance. **The closest mature rival.** | Moonlight is a **generic confidential-transactions layer**. Tukar is a **remittance corridor with fiat edges and disclosure depth**, positioned as the layer anchors plug into, not a general privacy primitive. Same tier, different product (see also the neighbours table above). |
| **Zarf** | Non-custodial privacy-preserving token distribution (email payments, vesting). | Zarf's job is private distribution/payouts. Tukar's job is **cross-border remittance** with fiat-in/fiat-out to local currency and a regulator-verifiable disclosure layer. Different edges, different user. |

## The remittance market Tukar enters (Stellar players without privacy)

These are the incumbents on the remittance side. None of them, on public material, ship
an on-chain privacy plus compliance layer, which is exactly the wedge Tukar adds on top of
the same corridors.

Felix Pago, Decaf, Chipper, Afriex, ScopeX, RemittEase, PeerPesa, DomiPago, SendIN.

Tukar's angle versus all of them is the **privacy + provable-compliance layer**, not a
cheaper or faster corridor. They move money; Tukar hides the payment graph while keeping a
single fact regulator-verifiable on chain.

## Potential partners, not rivals (licensed anchors)

The anchor-layer positioning only works if a **licensed** anchor sits at the fiat edge.
These are candidates Tukar's roadmap plugs into rather than competes with.

- **Yellow Card** — licensed stablecoin on/off-ramp across roughly 20 African countries.
- **Cash Abroad** — LATAM cross-border anchor.

Framing for judges: Tukar is the privacy + compliance layer; a licensed anchor is the
regulated fiat edge. The two compose.

## Composable building blocks (integrate, don't rebuild)

Consistent with the "we reuse, we don't reinvent" line below, here is the concrete
compose-not-rebuild stack.

| Block | What it gives Tukar | Status |
|---|---|---|
| **Reflector SEP-40 oracle** | On-chain FX read that gates off-ramp settlement | **Live** (already used) |
| **Reclaim** | zkTLS proof-of-personhood, bound to the Stellar address server-side, feeding the ASP allow-list | **Built** (the operator signs the resulting `set_asp_root`) |
| **Circle CCTP V2** | Cross-chain USDC, both directions | **Built** (the burn leg needs a user EVM wallet) |
| **OpenVASP TRP 3.2.1** | FATF Travel Rule exchange with verified Ed25519 signatures and a request lifecycle | **Built** |
| **TRISA** | Companion Travel Rule node alongside TRP | **Built, not activated** (needs an operator VASP registration and host) |
| **GLEIF** | LEI lookup for the IVMS101 `nationalIdentification` block | **Built** (keyless public API) |
| **idOS** | Reusable, portable KYC | **Built as a verified credential read.** It cannot feed the allow-list: idOS keys a credential by its owner's idOS user id and the consumer SDK exposes no user-keyed wallets read, so a share cannot be tied to a Stellar address |

## What the judges verified (the load-bearing facts)

These are checkable in this repo, not claims: **8** Circom/Groth16/BN254 circuits
(`ls circuits/*.circom`), **15** deployed-and-exercised testnet contracts
(`deployments/testnet.json`: an 8-contract core of pool plus 7 verifiers each with a
tamper-rejection proof, plus the reserves verifier, the policy registry, two reserves
contracts, and the pool-enforced, pool-accumulator and pool-timelock preview crates),
**52/52** pool contract tests and **314** across all 8 contract crates
(`cargo test` per crate), **230** webapp tests (`cd webapp && npm run test`), an on-chain
Reflector SEP-40 FX read that **gates settlement** (`SlippageExceeded`, fail-closed on a
stale or thin feed), and a native fee-bump gasless flow. This is the substance underneath the
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

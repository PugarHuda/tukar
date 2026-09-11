# Where Tukar sits, and how it differs

Stellar's privacy tier is real and getting crowded (a good sign, because that's where
Stellar is investing). This is an honest map of the neighbours and where Tukar is
genuinely different, plus where it deliberately *isn't* (so it stays relevant and
composable, not a reinvention).

## What Tukar concedes before it claims anything

The compliant shielded pool is no longer a differentiator on Stellar. SDF published its
own reference implementation of one on 2026-08-28, and the closest SCF Build award (Arcane,
SCF #42) is building the same thing with a compliance layer on top. Tukar sits on that same
primitive tier on purpose. Everything Tukar claims below is above the pool, not inside it.

## Category: Payments & Consumer Applications

Tukar is entered in the **Payments & Consumer Applications** category of the Stellar
APAC Grand Finale. It fits there directly: it is a **consumer remittance app** (send
money home to family) with mobile-first Sender and Receiver experiences and real fiat
in and out. The privacy and compliance layer is the moat, not the category. So the
map below has several kinds of neighbour: the **SDF reference implementations**
(Stellar Private Payments, Confidential Tokens), the **SCF-funded privacy projects**
(Arcane, Remi, Fairblock, Moonlight, LumenShade), and the **in-category rivals** (other
payments and consumer apps) Tukar is judged against.

## Stellar Private Payments, the one that resets the baseline

[Stellar Private Payments](https://github.com/NethermindEth/stellar-private-payments)
(SPP) is Nethermind's shielded pool, published as an
[SDF developer preview on 2026-08-28](https://stellar.org/blog/developers/developer-preview-stellar-private-payments),
Apache-2.0, testnet only. It is not an SCF project. It is Circom, Groth16 and BN254, with
UTXO commitments and nullifiers, Association Set Provider membership **and**
non-membership Merkle trees, `none` / `allowlist` / `blocklist` / `allowlist-blocklist`
policy modes proven inside the circuit, global view keys for administrator visibility,
selective disclosure via user view keys, a public key registry mapping Stellar addresses
to pool keys, and both TypeScript and Rust SDKs.

Tukar has to say plainly what that means. Tukar's in-circuit allow-list plus deny-list is
**not** a differentiator against SPP, because SPP proves the same thing in the same place
with the same curve and the same proof system. Tukar already credits this team, since the
verifier contract pattern in this repository is adapted from Nethermind's reference and
the README says so. Tukar sits on the same primitive tier as SDF's own reference
implementation, deliberately, because a corridor built on a divergent primitive would be
a corridor nobody else can compose with. The net-new work is above the pool, and the
sections below are about that work only.

## The neighbours

| Project | What it is | Compliance model | Chain / tech |
|---|---|---|---|
| **Confidential Tokens** (official Stellar/OZ) | Hides **balances & amounts** of an SEP-41 token; sender/recipient stay visible | Auditor keys / selective disclosure | Stellar · Noir + UltraHonk |
| **LumenShade** | A **privacy-pool** primitive (Tornado / 0xbow / Railgun lineage): deposit → shielded → withdraw, breaks deposit↔withdraw linkability | "Potential for" compliance (roadmap) | Stellar/Soroban · ZK |
| **Stellar Private Payments** (Nethermind, SDF developer preview) | A **shielded pool**: UTXO commitments and nullifiers, deposit to shielded transfer to withdraw | ASP membership **and** non-membership trees, four policy modes proven in-circuit, global and user view keys, selective disclosure | Stellar/Soroban · Circom/Groth16/BN254 |
| **Moonlight** (Aha Labs, SCF #37 Build) | A **general privacy layer**: accounts become constellations of unlinkable UTXOs; hides sender/recipient/amount. **Live on Stellar mainnet**, announced at the Stellar Developers Meeting of 2026-08-27 | Trusted **"Privacy Providers"** (banks/custodians) relay txns and add optional compliance hooks + selective disclosure | Stellar · UTXO + ZK |
| **Fairblock** (SCF #40 Build, Developer Tooling, $150,000) | **Confidential stablecoins** on Stellar: hides amounts and balances, addresses stay visible | Policy-gated auditor decryption of specific transactions | Stellar · additively homomorphic ElGamal + threshold IBE (not ZK privacy pools) |
| **Tukar** | A **remittance corridor** on the privacy-pool tier: fiat-in → shielded crossing → fiat-out to **local currency** | **In-protocol, trustless**: per-deposit ASP allow/deny proof (key pinned to `from`) + **four** on-chain-verified selective-disclosure types with on-chain-enforced aggregate completeness | Stellar/Soroban · Circom/Groth16/BN254 |

## The closest SCF Build awards

These three are the most recent and most similar funded work on Stellar. Leaving them out
would read as evasion, so they are named with their round, category and what the funded
scope actually covers.

**Arcane** (Arcane Finance), SCF #42 Build, End-User Application, $150,000.
[Project page](https://communityfund.stellar.org/project/arcane-private-compliant-layer-for-stellar-3fq).
This is the closest overall positioning. Arcane is a shared ZK shielded pool giving one
anonymity set across Stellar, plus a compliance portal for auditors with investigation
workflows, role-based selective disclosure scoped by role, application and time window, an
application gatekeeper policy framework, a developer SDK, and a reference app, funded
through to mainnet. It addresses the same problem Tukar addresses and it should be treated
as a genuine rival, not waved away.

The real difference is shape, and it is checkable in Arcane's own funded scope. Arcane is
**horizontal infrastructure for institutions to build on**, and its compliance is served by
an off-chain **Compliance Services Layer** (SEP-10 auth, SEP-1 role resolution, encrypted
audit event indexing, a scoped disclosure API with an access log). Tukar is **one vertical
corridor**, with SEP-24 fiat edges, local-currency payout, an on-chain Reflector FX read
that gates settlement, and disclosures verified on-chain by Soroban contracts rather than
served by a backend. Neither shape is better in the abstract. They are different products
for different buyers, and Arcane's is funded and further along.

**Remi**, SCF #44 Build, Financial Protocols
([submission](https://communityfund.stellar.org/submissions/recCJsvZpqeNpRztT)). This is
the closest business-model collision, because Remi's stated buyer is almost word for word
Tukar's, namely banks, exchange houses, MTOs, fintechs and PSPs that want confidential
settlement they can still audit. Remi keeps amounts and balances confidential on-chain with
auditor viewing keys and selective disclosure, and adds sponsored transactions so users pay
no fee. Sources conflict on the award amount. The SCF submission page lists $133.7K, press
coverage reports about $135,000, and a directory record gives a materially lower figure, so
this document does not rest anything on the number.

Two honest points. First, Remi integrates Stellar's **confidential-token** capability, so
addresses stay visible and amounts are hidden, where Tukar's shielded pool hides the
counterparties as well. That is a real architectural difference, not a marketing one.
Second, Remi was funded one round before this one and has distribution Tukar does not, with
its application citing a live UAE exchange-house partner and monthly volume already
confirmed. **Tukar has no edge on traction against Remi, and none on regulatory footprint.**
Tukar's only defensible claims against Remi are architectural and verification-related,
which is why this document does not argue the business axis.

**Fairblock**, SCF #40 Build, Developer Tooling, $150,000, submission titled "Private &
compliant payments on Stellar"
([submission](https://communityfund.stellar.org/submissions/recJbAw5nnUU1ZUmb)). Fairblock
is building confidential stablecoins on Stellar using additively homomorphic ElGamal for
amounts and balances plus threshold identity-based encryption, with range, conservation and
non-negativity proofs, and policy-gated auditor decryption of specific transactions. Amounts
and balances are hidden, addresses stay visible. An earlier version of this document
described Fairblock as a Cosmos and Arbitrum project outside the Stellar funded set. That
was wrong and is corrected here.

## Confidential Tokens, the other design point

[Confidential Tokens](https://stellar.org/blog/developers/developer-preview-confidential-tokens-on-stellar)
(OpenZeppelin contracts with a Nethermind UltraHonk verifier, SDF developer preview) is a
privacy wrapper for any SEP-41 token. It hides balances and transfer amounts and leaves
sender and recipient visible, with an auditor view key, selective disclosure, account
freezing inherited from the Stellar Asset Contract, and a configurable policy engine whose
policy contracts act as allow-list or block-list identity registries. SDF's own post frames
it as the opposite design point to a privacy pool, which shields both the parties and the
amounts, so it is a useful contrast rather than a rival. It does overlap Tukar's
policy-registry surface, which is worth naming rather than ignoring.

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
we should stop positioning on it as if it were. SPP, Arcane and several of the projects
above all ship it. Tukar's real differentiation is the parts
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
| **Moonlight** | Non-custodial privacy on Stellar using ZK proofs while preserving compliance. **Live on Stellar mainnet** since the Stellar Developers Meeting of 2026-08-27, which makes it the most mature privacy deployment on the network. | Moonlight is a **generic confidential-transactions layer**. Tukar is a **remittance corridor with fiat edges and disclosure depth**, positioned as the layer anchors plug into, not a general privacy primitive. Same tier, different product (see also the neighbours table above). |
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

Yellow Card is a licensed stablecoin on/off-ramp across roughly 20 African countries.
Cash Abroad is a LATAM cross-border anchor.

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
**55/55** pool contract tests and **317** across all 8 contract crates
(`cargo test` per crate), **230** webapp tests (`cd webapp && npm run test`), an on-chain
Reflector SEP-40 FX read that **gates settlement** (`SlippageExceeded`, fail-closed on a
stale or thin feed), and a native fee-bump gasless flow. This is the substance underneath the
positioning below. It is also larger than an earlier snapshot some reviewers saw (four
circuits, one disclosure type): the disclosure layer is now **four** on-chain-verified
types, which is itself part of the differentiator (see line 3 below).

## Four lines that separate Tukar

**1. Vertical product, not a horizontal primitive.**
LumenShade and Moonlight are *layers*. You shield an asset, or you get unlinkable
UTXOs, and then someone builds a product on top. Tukar **is** that product for one job:
a cross-border corridor with fiat edges (anchor SEPs), an off-ramp to **local
currency**, bearer notes and payment requests, end to end across 10 corridors. Tukar could
even *sit on top of* a privacy-pool primitive; it's not competing to be the primitive.

**2. In-protocol compliance, which holds against some neighbours and not against others.**
State the limit first. Against **SPP** and **Arcane** this is **not** a differentiator.
SPP proves allow-list membership and deny-list non-membership in-circuit exactly as Tukar
does, and Arcane's funded scope covers the same ground with an off-chain services layer.
Where the distinction does still hold is against **Moonlight**, which routes compliance
through trusted **Privacy Providers** (banks and custodians you trust to relay and
disclose), and against **LumenShade**, which lists compliance as a future goal. Tukar's
compliance is **proven on-chain, per deposit, with no trusted intermediary**: the ASP proof
pins `sourceKey = field(from)` and the deposit `require_auth`s that account, so it
authenticates that *this* depositor is allow-listed and not deny-listed. It is live and
soundness-tested today (`npm run test:asp`, `test:negative`). The one detail here that is
not standard on the tier is the binding of the proof to the authenticated depositor
account, which is a small hardening choice, not a moat.

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

**4. Oracle-gated settlement binds privacy to real-world FX.**
None of the neighbours tie fund movement to an on-chain FX oracle. Tukar's off-ramp
rate is read **on-chain from Reflector** and *gates the release* (min-receive on the
median of 5 records, fail-closed on a stale/thin feed). Remittance is fundamentally an
FX product, so making the oracle **load-bearing for settlement** is a differentiator the
pure-privacy projects have no reason to build, and that includes the first
**SEA corridor (Thailand/THB)** priced on-chain.

## Answering "this already exists (SPP / Arcane / Remi / Fairblock / Moonlight)"

It is a fair prompt, and the honest answer is a wedge, not a claim that the neighbours are
bad, and not a claim that the pool is ours.

The Open Track criteria say the track is not for teams replicating existing ecosystem
solutions, and that a team whose work overlaps an existing solution must clearly explain
how it meaningfully improves on that solution. Arcane and Stellar Private Payments both
ship a shielded pool with compliance proven inside the circuit, so Tukar states the
overlap rather than denying it. The shielded pool is a shared ecosystem primitive and
Tukar does not claim to have invented it. Tukar's verifier pattern is adapted from the
same Nethermind reference that SPP comes from, and SDF's own privacy documentation now
treats privacy pools with Association Set Providers and view keys as canonical
architecture rather than as novel work
(https://developers.stellar.org/docs/build/apps/privacy). What Tukar builds is the
remittance vertical above that primitive: fiat edges through the anchor SEP stack, an
off-ramp to local currency, an on-chain Reflector FX read that gates settlement, four
disclosure types verified by their own Soroban contracts with a registry that rejects
unregistered context hashes, a full-pool liability accumulator for proof of reserves, and
a working OpenVASP TRP Travel Rule leg. The improvement claimed is the composition and
the vertical, not the pool.

Where that leaves the individual neighbours. **SPP** is the primitive and Tukar concedes
the primitive to it. **Arcane** is the same problem in a horizontal shape with off-chain
compliance services, and is further along. **Remi** is the same buyer with a
confidential-token architecture and real distribution, and Tukar has no traction argument
against it. **Fairblock** hides amounts and balances while leaving addresses visible, a
different privacy model for a different threat. **Moonlight** is live on mainnet with
compliance through trusted providers. **LumenShade** is a pool with compliance on its
roadmap. What none of them ships, on public material, is the four-part composition above
wired to real anchor SEPs. That composition is the claim, and each of its four parts is
checkable in this repository.

**What we did not find.** In the sources searched for this document, we found no
SCF-funded project doing FATF Travel Rule messaging on Stellar, and none doing
cryptographic proof of reserves for a shielded pool on Stellar. That is stated as "not
found in these sources", not as "does not exist". A reviewer with better sources may know
of one.

## Positioning in one line

> **Private for users AND provable to regulators, on the chain built for cross-border
> money.** Concretely: the **compliant remittance vertical** of Stellar's privacy-pool
> tier. The pool is a shared ecosystem primitive and Tukar concedes it to SPP and Arcane.
> What Tukar adds above it is four on-chain-verified disclosure types with a registry that
> rejects unregistered requests, oracle-gated settlement, a full-pool liability accumulator,
> and a working Travel Rule leg, all wired to real anchor SEPs.

## Staying relevant, on purpose

- **We reuse, we don't reinvent.** Verifier pattern adapted from Nethermind's
  reference; phase-1 setup is the real Hermez ceremony; FX from Reflector; fiat edges
  via the anchor SEP stack. Tukar is the *composition* that doesn't exist yet, not new
  crypto for its own sake.
- **We fit Stellar's stated strategy.** SDF's builder documentation at
  https://developers.stellar.org/docs/build/apps/privacy now documents privacy pools with
  Association Set Providers and view keys as canonical Stellar architecture, alongside
  confidential tokens as the other design point. Building on that architecture is
  alignment, not novelty, and this document says so rather than dressing it up. Tukar is
  a working instance of it aimed at Stellar's flagship use case, cross-border payments.

**Sources, all fetched while writing this document.**

- SDF privacy architecture: https://developers.stellar.org/docs/build/apps/privacy
- Stellar Private Payments preview: https://stellar.org/blog/developers/developer-preview-stellar-private-payments
- Stellar Private Payments source: https://github.com/NethermindEth/stellar-private-payments
- Confidential Tokens preview: https://stellar.org/blog/developers/developer-preview-confidential-tokens-on-stellar
- Arcane: https://communityfund.stellar.org/project/arcane-private-compliant-layer-for-stellar-3fq
- Remi (SCF #44): https://communityfund.stellar.org/submissions/recCJsvZpqeNpRztT
- Fairblock (SCF #40): https://communityfund.stellar.org/submissions/recJbAw5nnUU1ZUmb
- Moonlight mainnet launch: Stellar Developers Meeting broadcast of 2026-08-27

Neighbour descriptions are our honest reading of public material and may lag their latest
releases.

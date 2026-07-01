# Discord / feedback post — responding to the Confidential Tokens preview

Context: Stellar's "Confidential Tokens" developer preview (OpenZeppelin + Nethermind
UltraHonk + Noir) invites devs to try it and share feedback. Tukar lives in the
*complementary* privacy-pool tier, so this is honest, on-topic engagement — not spam.
Post this in the Stellar Developer Discord (or as a reply to the announcement).

---

## Short version (Discord-length)

> Tried the Confidential Tokens preview 👀 — really like that it's a **wrapper**
> contract, so a circuit bug is contained to one wrapper's tokens and can't touch the
> underlying asset. The auditor-view-key + selective-disclosure + configurable policy
> engine is exactly the compliance surface institutions ask for.
>
> One honest question: since it's *confidential, not anonymous* (counterparties stay
> visible), is the **SEP-31 cross-border** case out of scope — or is that where a
> privacy-pool layer sits on top?
>
> Sharing what I built for **Stellar Hacks: Real-World ZK** that lives in that other
> tier: **Tukar** — a Privacy-Pools cross-border remittance corridor.
> ▸ live: https://tukar-six.vercel.app  ▸ code: https://github.com/PugarHuda/tukar
>
> Confidential Tokens hide *amounts*; Tukar's shielded leg hides *amount **and**
> counterparties* (the payment graph) — the remittance threat model. Funny thing: we
> landed on the **same compliance primitives independently** — ASP allow/deny +
> selective disclosure, verified on-chain — so I actually adopted a configurable
> policy engine after seeing yours. Circom/Groth16/BN254 on my side vs your
> Noir/UltraHonk. Would love the two tiers documented together as one privacy stack 🙌

---

## Points behind it (all things Tukar can back up with a link, if asked)

- **Honest CT feedback (genuine):** the wrapper-isolation design is the standout; the
  oracle price-guard is a fat-finger net, not anti-manipulation (their own docs are
  honest about this) — the proof is the real binding. The auditor/disclosure/policy
  trio is the right compliance surface.
- **Where Tukar differs (factual):** privacy-pool tier — hides counterparties too;
  cross-border remittance use case; the fiat edges are public by design.
- **Where they overlap (shows real engagement):** same compliance model; Tukar
  *adopted* configurable policy (`set_asp_root`/`set_deny_list`) after the CT preview.
- **The bridge (constructive):** SEP-31 is where a privacy-pool leg would slot between
  two anchors — and Tukar already integrates the anchor SEPs (SEP-1 published +
  SEP-10/6/24/31 live vs the SDF reference anchor, `npm run sep:anchor`).

Keep it to the short version when posting; the points are just so the follow-up
answers are ready. Don't overstate: Tukar is a hackathon build, not audited.

# SCF Build Interest Form — Tukar (ready to paste)

Copy each field into the form. Fields marked **[ISI SENDIRI]** need your own data.

---

## Project Information

**Project Title**
```
Tukar
```

**Project Description**
```
Tukar is a private cross-border remittance corridor on Stellar. Someone working abroad deposits USDC, the transfer across the corridor hides the amount and both counterparties on-chain, and their family cashes out to local fiat. What sets it apart from every other privacy tool: it stays provable to a regulator. Every deposit proves in-circuit that the sender is compliant (allow-listed and not sanctioned), and a holder can selectively disclose one fact about a payment that is verified on-chain. Public stablecoin rails are cheap but leak everyone's financial history; privacy mixers can't answer a regulator. Tukar is private for the user and compliant at the same time, on a real corridor with fiat at both edges, so a licensed anchor can actually run it. Private in the middle, accountable at the edges.
```

**Project Category**
```
End-User Application
```

**Current Traction**
```
Tukar placed 5th in the Stellar Hacks: Real-World ZK hackathon and is a Grand Finalist in the Stellar APAC hackathon (Payments & Consumer Applications). It is live end to end on Stellar testnet (pre-revenue, no external users yet): 7 Circom/Groth16 circuits and 8 Soroban contracts deployed and exercised on testnet, 52 passing contract tests, a deployed web app with four role apps (sender, receiver, regulator, operator), real on-chain deposit and withdraw, a Reflector oracle-gated off-ramp, and selective disclosure verified on-chain with a tampered proof rejected. Evidence: live app https://tukar-six.vercel.app, deck https://tukar-six.vercel.app/deck, source https://github.com/PugarHuda/tukar. Honest status: not professionally audited, and the fiat on and off ramps are simulated against SDF's reference anchor (a licensed anchor is the production step).
```

**Website**
```
https://tukar-six.vercel.app
```

**Planned Stellar Integration**
```
Already integrated on testnet, not just planned. Soroban smart contracts in Rust: a pool that custodies real testnet USDC plus seven BN254 Groth16 verifier contracts, using Protocol 25/26 host functions for on-chain pairing checks. SEP-1 (stellar.toml discovery), SEP-10 and SEP-24 (interactive fiat on and off ramp against SDF's reference anchor, with Onramper wired as the licensed off-ramp path), and SEP-41/SAC for USDC. The Reflector SEP-40 FX oracle is read on-chain as a min-receive settlement gate. Native fee-bump (CAP-15) is proven as a gasless primitive. Next steps: swap the reference anchor for a licensed KYC anchor to go live on one corridor, a professional contract audit, and a genuinely distributed trusted-setup ceremony.
```

**Build Track**
```
Open track (net-new protocol / primitive)
```
> Reasoning: Tukar deploys net-new ZK primitives (7 circuits + 8 contracts, a shielded compliant corridor), not just an app wiring existing blocks. If you prefer to be judged as a consumer app leaning on the ecosystem, pick Integration Track instead.

---

## Team Information

**Submitter type**
```
Team
```
> (Or Company if incorporated; Individual if solo.)

**Email**
```
hudapugar@gmail.com
```

**Team Description** — **[ISI SENDIRI: jumlah anggota + LinkedIn]**
```
We are a team of [N]. Expertise across zero-knowledge (Circom / Groth16 / snarkjs), Soroban / Rust smart contracts, and full-stack product (Next.js, TypeScript). [Sebutkan pengalaman atau company sebelumnya kalau ada.] LinkedIn: [link tiap anggota].
```

---

## Referral Information

**Have you been working with someone from SDF / the Stellar community?**
```
Yes
```
**Referral Code** — **[ISI SENDIRI: kode dari referrer-mu]**
```
[masukkan kode unik yang dikasih referrer]
```
> Kalau sebenarnya TIDAK ada referrer / kode, ubah jawaban ke **No** dan kosongkan field ini. Jangan isi asal.

---

## Checklist sebelum submit
- [ ] Team Description: isi jumlah anggota + LinkedIn
- [ ] Referral Code: isi kode asli, atau ubah ke "No"
- [ ] Build Track: pilih Open (atau Integration) sesuai keputusanmu
- [ ] Cek batas karakter tiap field (kalau kepanjangan, minta aku pendekin)

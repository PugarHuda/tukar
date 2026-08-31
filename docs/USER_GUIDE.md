# Tukar User Guide

Tukar is a private cross-border remittance corridor on Stellar. Money enters in one country and leaves in another. The deposit and the withdrawal are public at the edges by design, but the crossing in the middle is shielded, so amounts and counterparties stay hidden. Every transfer is proven compliant with zero-knowledge and verified on-chain by a live Stellar verifier.

This guide walks a real tester through the whole thing, step by step. It is written for the live testnet build at **https://tukar-six.vercel.app**.

Tukar is four focused apps:

- **Sender** and **Receiver** are mobile-first consumer apps. Send money, then claim and cash it out.
- **Regulator** and **Operator** are desktop consoles. Verify disclosures and audit, or watch pool health and policy.

A quick warning before you start. This runs on Stellar **testnet** with free test tokens. Never use real funds. Nothing here is audited. The fiat on-ramp and off-ramp make real SEP calls but run against SDF's reference testnet anchor, so no real money moves. See "What is real vs simulated" near the end for the full picture.

---

## 1. Getting started

You need a wallet before you can send or withdraw. You have two ways in, and neither one asks you for a seed phrase.

1. Open **https://tukar-six.vercel.app** in any modern browser. On the landing page pick a role, or go straight to `/sender`, `/receiver`, `/regulator`, or `/operator`.
2. At the top of each app there is a connect bar. Tap **Use testnet key**. This activates a real throwaway testnet key and does best-effort testnet funding, so you can do real on-chain transactions with no install and no seed phrase.
3. Or tap the **Freighter** option to connect your own Freighter wallet instead. Funds then move to whichever account you connect.
4. Note the shared-key hint under the connect bar: "Testing with others? Connect Freighter for your own key (the built-in testnet key is shared)." The built-in testnet key is shared across everyone using the demo, so if you are testing alongside other people, connect Freighter so your payments and balances stay your own.

Once connected, the bar shows whether you are on the testnet key or Freighter, plus a short version of your address.

---

## 2. Send money (Sender)

The Sender app lives at `/sender`. It builds a real compliance proof in your browser, does a real on-chain deposit, and hands you a claim note to share.

1. Connect first, using the testnet key or Freighter as in section 1.
2. Enter an amount in USDC and pick a **Destination** corridor. There are 10 corridors: Mexico (MX), Brazil (BR), Argentina (AR), Philippines (PH), Indonesia (ID), Vietnam (VN), Thailand (TH), India (IN), Nigeria (NG), and Colombia (CO). As you type, Tukar shows what the recipient receives in local currency, using the live rate (from the Reflector on-chain oracle where the testnet feed carries it, otherwise a public FX read).
3. Look at the "what you'd pay elsewhere" savings line. It compares the corridor cost against typical remittance fees so you can see the difference.
4. Continue to the confirm step, review the recap (amount, recipient, destination, what they receive), and hit **send**.
5. Watch the progress screen. The compliance proof is built client-side, then a signed `pool.deposit` goes on-chain for real, and the commitment is registered in the Merkle tree. You can open the deposit transaction on the Stellar explorer from the link shown.
6. On success you get a **claim note (bearer)**. This is a `tukar1:` string, also shown as a QR code. Whoever holds it can claim the payment, so share it only with the recipient. Use **Share claim note** or copy the string, then send it to the person collecting the money.

A couple of honest notes the app makes plain. Only allow-listed sources can deposit, and a deny-listed source makes the compliance proof unsatisfiable so the deposit will not proceed. And deposits are public at the edge by design. The USDC deposit and the later withdrawal are visible on-chain. Only the crossing in between is shielded.

---

## 3. Receive and cash out (Receiver)

The Receiver app lives at `/receiver`. This is the person collecting the payment.

1. Connect with the testnet key or Freighter. Funds withdraw to whichever account you connect.
2. Go to the **Claim** tab. Paste the `tukar1:` claim note the sender gave you into the claim box, or scan its QR with your camera, then tap **Claim payment**. The payment now shows up in the **Payments** tab.
3. Open the payment in **Payments** and reveal your figure. The local-currency amount is read on-chain live from the Reflector oracle (a median of recent records for corridors that carry an oracle feed), so the number you see is a real on-chain quote, not a guess.
4. **Withdraw** the payment on-chain. This spends the note's nullifier and releases the tokens to your connected account. A min-receive gate protects the rate, so the withdrawal only settles if the on-chain quote still clears the floor. That stops you from being cashed out at a rate that moved against you.
5. Off-ramp to local fiat from the same card. The SEP-24 withdraw is a real interactive flow against SDF's reference testnet anchor, with a SEP-38 firm quote bound into it, but no real money hits a bank account, so treat the cash-out as a demonstration of the flow.

There is also a **Request** tab if you want to generate a payment request for a sender to fulfill, but the core claim-and-cash-out path is the three steps above.

---

## 4. Prove a fact (selective disclosure)

Selective disclosure lets you prove something about a payment without revealing the whole amount. You start from a payment you hold, in the Receiver app, and produce a receipt that a regulator can independently check.

1. Open a held payment in the Receiver **Payments** tab.
2. Generate one of the four disclosures. Each is a separate zero-knowledge circuit, verified on-chain:
   - **exact**: this commitment opens to exactly this amount.
   - **threshold**: the amount is at or below a figure, with the amount itself hidden.
   - **range**: the amount sits inside a two-sided band.
   - **aggregate**: a portfolio sum across payments is at or below a cap.
3. Export the receipt. The receipt is bound to a specific audit request, so it cannot be replayed against a different question. Hand it to the regulator, or paste it into the Regulator console yourself (section 5).

---

## 5. Regulator console

The Regulator console lives at `/regulator`. It is a read-heavy desktop dashboard for verifying disclosures and running audits. It has five tabs.

1. Open `/regulator`. The default **Pool report** tab shows live pool and policy state read from chain.
2. Go to **Verify disclosure**, paste a receipt from section 4, and verify it. Tukar checks it two ways: in the browser with snarkjs, and against the live Stellar on-chain verifier, routed to the right verifier contract by disclosure type. A genuine receipt comes back valid and bound to its audit request. Tamper with the receipt and it comes back invalid, both off-chain (false witness rejected) and on-chain (InvalidProof).
3. Go to **Issue audit request** to register an aggregate audit request on-chain. This is the request a disclosure receipt gets bound to.
4. Open the **Travel Rule (reference)** tab to see how the FATF Travel Rule maps onto the corridor. Two different things sit on this tab, and the split matters. The IVMS101 payload is a reference mapping: the amount, asset, corridor and transaction reference come from a disclosure you actually verified, while every PII field is an anchor-held placeholder, because Tukar holds no PII. The exchange itself is real. **Send** builds a spec OpenVASP TRP 3.2.1 transfer inquiry, signs the canonical body with Ed25519, sets the three TRP headers, and posts it either to the Notabene sandbox or to Tukar's own inbound TRP endpoint, which verifies the signature before answering. You see the beneficiary's real approved or rejected response, the assigned settlement address, and the request lifecycle. A TRISA companion node ships alongside it and stays honestly off until the operator registers a test VASP and hosts it.
5. The **Audit trail** tab keeps a session record of what you verified and requested.

---

## 6. Operator console

The Operator console lives at `/operator`. It is the desk-operator view of the corridor's health and policy. Everything is read from chain.

1. Open `/operator`. **Pool health** shows the USDC held in custody, publicly verifiable on-chain, along with pool activity.
2. Review the compliance policy. Two layers are enforced on-chain today, both global: the **ASP allow-root** (only allow-listed sources can deposit) and the **deny-list** (a sanctions block-list of exactly 8 non-membership entries).
3. Below that is the **per-corridor policy**. Each corridor's amount cap and required disclosure mode are real records in an on-chain policy registry contract, read live over RPC, and the admin re-points a corridor with a signed `set_policy` with no redeploy. Two honest notes stay attached. The figures themselves are demonstration values, not real regulatory thresholds. And enforcement of the cap at withdraw runs on the preview enforcement pool, not on the live pool, because the live pool has no upgrade hook; the app's deposits and withdrawals route to the live pool, where the enforced policy is still the global allow-root and deny-list.
4. Check the **Reflector FX oracle** the pool reads for off-ramp quotes and the min-receive gate.
5. See the deployed contract inventory and custody, so you can confirm what is live on-chain and where the money sits.

---

## What is real vs simulated

Tukar is honest about the line between what runs for real and what is stubbed for a testnet demo.

**Real, on Stellar testnet:**

- The zero-knowledge proofs. Compliance, transfer, and all four disclosure circuits are generated client-side in your browser. Eight circuits in total, including the proof-of-reserves circuit.
- The 15 deployed contracts. An 8-contract core (pool plus 7 verifiers), plus the reserves verifier, the per-corridor policy registry, two proof-of-reserves contracts, and three preview-track contracts (enforcement pool, liability accumulator, admin timelock).
- Deposits and withdrawals. These are real signed on-chain transactions.
- On-chain verification. Disclosure receipts are verified by the live Stellar BN254 Groth16 verifier.
- The oracle read. FX figures come from the live Reflector SEP-40 oracle on-chain.
- The Travel Rule exchange. OpenVASP TRP 3.2.1, with the Ed25519 signature verified on receipt and a tracked request lifecycle.
- Cross-chain USDC. Circle CCTP V2 in both directions against the real Circle Iris sandbox. The burn leg needs your own EVM wallet with test USDC and gas.
- Proof-of-reserves. A liability accumulator adds each proven deposit and subtracts each released withdraw, so the attested total is exact.
- Recurring sends. A due plan executes a real on-chain deposit and tree registration.

**Standing in for production:**

- The fiat on-ramp and off-ramp. The SEP calls are real (SEP-1, SEP-10, SEP-12, SEP-24, SEP-38 firm quotes), but they run against SDF's reference testnet anchor, whose KYC endpoint approves without review. There is no real KYC and no real bank movement on testnet, and a licensed anchor is the production step.
- Per-corridor cap enforcement, the admin timelock, and the exact accumulator run on preview contracts rather than the live pool, pending a state migration.
- The TRISA leg is committed code that stays off until the operator registers a test VASP and hosts the node.

**Also worth stating plainly:**

- Not audited.
- Testnet only. Use free testnet tokens. Never use real funds.
- Deposits and withdrawals are public at the edges by design. Only the corridor crossing in between is shielded.

---

## Troubleshooting

- **Freighter not detected.** If connecting Freighter fails, you will see a message like "Freighter not detected. Install it, or use the testnet key." Install the Freighter extension and reload, or just tap **Use testnet key** to keep going with no install.
- **An on-chain read is slow.** Reveals, verification, and pool reads all hit Stellar testnet live, so they can lag when the network is busy. Give it a few seconds before retrying. A figure showing as a placeholder usually means the read has not returned yet.
- **A claim note will not open.** Make sure you pasted the whole `tukar1:` string with nothing trimmed, into the **Claim** tab of the Receiver app. If you are scanning the QR, hold steady until it reads. A note that was already claimed and withdrawn cannot be claimed again, since its nullifier is spent.
- **Balances or payments look like someone else's.** The built-in testnet key is shared. Connect Freighter for a key that is only yours, especially when testing alongside other people.

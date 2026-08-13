# User onboarding and feedback (Builder Challenge Levels 4 to 7)

This is the honest, legitimate way to satisfy the user-onboarding requirements. It relies on
**real people** trying the live app and giving real feedback. Do not fabricate users; a
reviewer can trivially check that a wallet never transacted and that feedback is templated.

Live app to share: **https://tukar-six.vercel.app** (one tap gives a real testnet key, no
install, no seed phrase, so onboarding a tester takes seconds).

---

## 1. Create the Google Form (2 minutes)

Make a Google Form titled "Tukar, try it and tell us what you think" with these fields (the
challenge requires exactly wallet address, email, name, and a product rating plus feedback):

- **Name** (short answer, required)
- **Email** (short answer, required)
- **Stellar wallet address** (short answer, required) — "Paste your address. In the app it's
  shown at the top after you connect (starts with G...)."
- **Rate the product** (linear scale 1 to 5, required)
- **What worked / what was confusing?** (paragraph, required)
- **What one feature would make you use it?** (paragraph, optional)
- Optional: which corridor did you try, did you use the built-in key or Freighter.

Turn on "Collect email addresses" and share the link with real people.

## 2. Get real testers (aim 10 for Level 4, 50 for Level 5)

- Post the app link plus the form in the Stellar Discord builder channels, your hackathon
  cohort, and your own network.
- Give a one-line script: "Open the link, tap Use testnet key, send a test payment, then fill
  this 1-minute form." 
- Each tester's send/claim is a **real on-chain testnet transaction**, which is the "proof of
  wallet interactions" the challenge asks for.

## 3. Export responses and link them in the README

- In Google Forms, Responses tab, open in Sheets, then File, Download, Microsoft Excel (.xlsx).
- Commit the file to the repo, e.g. `docs/onboarded-users.xlsx` (redact nothing that the
  tester agreed to share; do not commit anything they did not consent to).
- Link it from the README onboarding section (a placeholder link is already there).

## 4. Prove the wallet interactions

- The corridor pool and every transaction against it are public on stellar.expert:
  https://stellar.expert/explorer/testnet/contract/CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ
- Each tester's address from the form should appear there as a real invocation. That is
  verifiable, third-party proof, not a claim.

## 5. Improvement plan (required by Level 5 and 6)

After collecting feedback, write, in the README, what you changed because of it, with a git
commit link per change. Template:

```
## What we improved from user feedback
- Feedback: "the connect step was unclear" (3 testers)
  -> Change: clearer one-tap connect copy and a hint. Commit: <link>
- Feedback: "I couldn't tell my payment went through"
  -> Change: added an on-chain confirmation state. Commit: <link>
```

Use real feedback and real commits. If you have not changed anything yet, do that first, then
fill this in.

---

## Honest status of the higher levels

- **Level 4 (10 testnet users) and Level 5 (50 testnet users):** reachable honestly with the
  steps above. The app is live and onboarding is one tap.
- **Level 6 (Stellar mainnet, 20 mainnet users, an audit or mentor security review):** this is
  a real, heavy step. Tukar is testnet only and not professionally audited. Going to mainnet
  with a shielded pool that holds real funds should not be rushed or faked; it needs the audit
  and a distributed trusted-setup ceremony first (both on the roadmap). Do not deploy to
  mainnet or claim an audit you do not have.
- **Level 7 (50+ new mainnet users, growth report, 50+ social followers):** follows a real
  mainnet launch. Growth and followers are earned, not manufactured.

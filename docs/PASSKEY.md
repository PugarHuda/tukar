# Passkey smart-wallet sign-in

Sign in to Tukar with a passkey (Face ID, Touch ID, Windows Hello) instead of a browser extension or
a seed phrase. Built on [passkey-kit](https://www.npmjs.com/package/passkey-kit) 0.16.5 and the
OpenZeppelin Stellar Relayer Channels service.

Everything below was verified on **2026-08-31** against **testnet (protocol 28, RPC 28.0.1)**. Where
something was not verified, it says so and why.

---

## 1. What is implemented

| File | Role |
|---|---|
| `webapp/lib/passkey.ts` | Browser half: the lazy `PasskeyKit` singleton, create/connect, the `WalletSigner` a passkey installs, the USDC SAC balance read and the contract-account faucet. |
| `webapp/app/api/passkey/send/route.ts` | Server half: rate-limited, allow-listed relayer submission. Holds `OZ_CHANNELS_API_KEY`. |
| `webapp/components/WalletProvider.tsx` | `connectPasskey("create" \| "connect")`, `kind === "passkey"`, silent rehydrate across reloads, disconnect. |
| `webapp/components/WalletBar.tsx` | The two buttons ("Sign in with passkey", "New passkey wallet") and the honest limitations copy. |

The wallet is a **Soroban contract account** (a `C…` address) whose only signer is the user's passkey
(secp256r1, verified on-chain by the wallet contract's `__check_auth`). It holds no XLM: the
OpenZeppelin relayer builds the envelope with a channel account and pays the fee.

Flow, as the code actually runs it:

1. **New passkey wallet**: `kit.createWallet()` runs a WebAuthn registration ceremony, builds a
   `createContractV2` deploy of the wallet WASM salted by `sha256(keyId)`, and has the deterministic
   ed25519 deployer sign the deploy auth entry. The browser POSTs that transaction to
   `/api/passkey/send`; the route checks it deploys **exactly** the pinned WASM hash and relays it.
2. **Sign in with passkey**: `kit.connectWallet()` with no keyId runs a discoverable-credential
   ceremony (the browser shows the passkey picker), resolves the wallet address from local storage or
   deterministic derivation, then verifies the deployed **code hash** and that the keyId is a **live
   signer** on that contract before connecting.
3. **Reload**: `tukar:conn` stores `passkey:<keyId>`; the rehydrate path calls `connectWallet({keyId})`,
   which is silent (no WebAuthn prompt).
4. **Funding**: a classic payment cannot target a `C…` address, so `faucetUsdcToContract` sends a USDC
   **SAC transfer** from the demo key when the new wallet's balance is 0. No trustline, no XLM needed.

Trust boundary on the server route: the relayer sponsor pays for whatever lands there, so only two
shapes are accepted: a `createContractV2` of the pinned wallet WASM hash, or an `invokeContract`
whose target is the Tukar pool or the USDC SAC. Everything else is refused with a 400. Body is capped
at 200,000 XDR chars and the route is rate limited to 20 requests/minute/IP. Without
`OZ_CHANNELS_API_KEY` it returns `{ configured: false }` rather than faking a hash.

---

## 2. What is verified, with evidence

### 2.1 The wallet WASM is really on testnet

`getLedgerEntries` for the `ContractCode` key of
`502ea4e7bdb3ea99880941f1d35ceb67fb598692c0bb40f842ef9c9f17d58b58` (the hash pinned in
`lib/passkey.ts`, identical to the one in passkey-kit 0.16.5's own README):

```
HTTP 200
contractCode entry FOUND
  wasm bytes 33094
  lastModifiedLedgerSeq 4226258   liveUntilLedgerSeq 7507717   latestLedger 4429861
```

### 2.2 The relayer answers and the key is valid

Three POSTs to `https://channels.openzeppelin.com/testnet` (secret never printed):

| Probe | Result |
|---|---|
| real key, deliberately invalid `{"xdr":"not-a-valid-xdr"}` | **HTTP 500** `XDR Read Error: unknown EnvelopeType member for value -1635025301`, so the key authenticated and the plugin ran |
| bogus key, same body | **HTTP 401** `{"success":false,"code":401,"error":"Unauthorized"}`, so the endpoint really does check the key |
| real key, `{}` | **HTTP 400** `INVALID_PARAMS` `Must pass either \`xdr\` or \`func\` and \`auth\`` |

### 2.3 The server route relays a real, fee-sponsored transaction

Against a local production build (`npm run build && npx next start -p 3260`), a single-op
`invokeHostFunction` calling the USDC SAC, with an auth entry signed by an ed25519 key:

```
POST /api/passkey/send -> 200
{"configured":true,"hash":"5ac5c7d33ed1831111b9e017bb5c42ab8329eb408cce2076c6101239800d312c"}
```

Horizon confirms the relayer paid, not us:

```
successful      true            ledger 4429913
source_account  GASPBKBEJM3IVZ3WEQLFUHKCYMW52XCLLNSBDW4TSPIWKMDPBRPJGYOU   (OZ channel account)
fee_account     GCNJB6V5YIODDSSCWXZ2VOKMRPRVZ2V723RRQS6STXE6NWTGVOJY35CN   (OZ fee bump account)
fee_charged     42939
```

The route's allow-list was exercised in the same run:

- XLM SAC target -> `HTTP 400 {"error":"Refused: only pool and USDC calls are sponsored."}`
- a read-only invoke -> relayer replies `status: "readonly"`, which passkey-kit maps to a
  non-terminal result, and the route returns 502 rather than a fake hash.

### 2.4 The whole browser flow works headlessly

Playwright + CDP `WebAuthn.addVirtualAuthenticator` (`ctap2` / `internal`, resident key + user
verification), against the production build on `:3260`, clicking the real buttons in the WalletBar:

```
1. CREATE  -> CC3EUUW3KGRHIJ5QG3KR3SL5LHVI3FXQK4IHHOLDDIQ7VSNTI5CXSMCG
              keyId rki5cYtsmcLksXbAK0YvDvx00It84eGdkqxTG9n2de4
              deploy tx 9cbe58aa1a8df09d52d367e301d646e08f591402953c5f88fb120e2b2990fa21
2. RELOAD  -> same address, silent (no second WebAuthn ceremony)
3. DISCONNECT -> tukar:conn cleared
4. SIGN IN WITH PASSKEY -> same address, via the discoverable-credential picker
credentials on the virtual authenticator: 1 (unchanged across all four steps)
USDC balance of the wallet: 1000000000 stroops (100 USDC, from the SAC faucet)
deployed instance executable wasm hash: 502ea4e7…d58b58   (matches the pin)
```

An earlier identical run produced wallet `CDK7…Q7BE` and deploy tx
`200fa6f3c2a935aa23de65b3e644d6fceb795f21001e2fa95aa3c38cd14e3304` (ledger 4429926, `fee_account`
`GCNJB6V5…35CN`, deployer `GC2C7AWLS2FMFTQAHW3IBUB4ZXVP4E37XNLEF2IK7IVXBB6CMEPCSXFO`, the
deterministic passkey-kit deployer).

So: **passkey registration, wallet deployment, funding, silent rehydrate, disconnect and
discoverable sign-in are all real and verified end to end, with no browser extension and no seed
phrase.**

### 2.5 A passkey signature is valid on-chain

The app's own `makePasskeySigner(...).signAuthEntry` was driven from the page (virtual
authenticator) over a real `SorobanAuthorizationEntry` for a USDC transfer **out of** the C-address.
It returned a signed entry whose credentials are `sorobanCredentialsAddressV2`, signed by the wallet
address. Submitted straight to Soroban RPC (with the demo key as transaction source paying the fee):

```
wallet  CB57VQNPZTD3GE7XTHEYG4F6LB7AOWRY73FT5PUAIV7PLITDSMZDFIFV
tx      65dea57243cdd35dd3cc5f3d2a27a931d8fa993c9b74756c551019c363363c09   status SUCCESS
```

The wallet contract's `__check_auth` accepted the WebAuthn assertion. The signing half of the pool
write path works.

---

## 3. What does NOT work, and why

### 3.1 Relayed contract writes from a passkey wallet (deposit / withdraw)

**This is the one real gap.** passkey-kit 0.16.5 signs auth entries as CAP-0071-02 **address-bound**
credentials only ("there is deliberately NO V1 signing path", see `dist/kit/tx-ops.js`). The
OpenZeppelin Channels service decodes submitted auth entries with an older `@stellar/stellar-sdk`
and does not know that credential type.

Proved by sending the *same* auth entry twice, once as V1 and once as V2:

```
[V1 sorobanCredentialsAddress]    HTTP 200
   {"success":true,"data":{"hash":"7e91ab87e77ed8566b5d02f6b3c46d0ba7d6f6a4cee139a7e94ddeb131565256",
    "status":"confirmed","transactionId":"78471075-dd7f-4d12-8c06-9902da8f8beb"}}

[V2 sorobanCredentialsAddressV2]  HTTP 400
   {"code":"INVALID_PARAMS","details":{"message":"XDR Read Error: unknown SorobanCredentialsType member for value 2"},
    "error":"Invalid `func` or `auth` encoding"}
```

And end to end through our own route with a genuinely passkey-signed entry:

```
passkey signAuthEntry: signed by CCK3P5XW4WCNJUZWTKBYGDFXLIYWR4JVHKGUK2IEG4BEB5OUGGO5N3DV
relay -> 502 {"configured":true,"error":"Invalid `func` or `auth` encoding","hash":null}
```

The wallet **deploy** relays fine because its auth entry is signed by the ed25519 deployer with the
SDK's ordinary `authorizeEntry`, so it stays V1.

Consequences and handling:

- `lib/passkey.ts` `relay()` maps that relayer error to a plain-language message instead of leaking
  `Invalid \`func\` or \`auth\` encoding` to the user.
- `components/WalletBar.tsx` says so on the connected strip and in the pre-connect blurb. No button
  claims a capability the code does not have.
- The feature is **not** removed and nothing is mocked: the moment the relayer bumps its SDK, the
  existing `submit` path works unchanged.
- Alternative if it needs to work before then: submit the passkey-signed transaction directly to RPC
  with an app-held source account paying the fee (exactly what section 2.5 did). That is a design
  decision, not a bug fix, so it was not made here.

### 3.2 SEP-53 message signing is impossible for a contract account

A `C…` address has no ed25519 key, so it cannot produce a SEP-53 message signature and cannot be the
source account of a classic transaction. `lib/wallet-kit.ts` refuses honestly for
`kind === "passkey"`, and `makePasskeySigner.signTransaction` throws with a specific message rather
than silently doing nothing. Covered by a unit test in `lib/wallet-kit.test.ts`.

Every place in the app that needs it, and what the user sees:

| Feature | Where | Needs | Behaviour with a passkey wallet |
|---|---|---|---|
| Scheduler sign-in (private recurring plans, server-side spending guard) | `lib/auth-client.ts` `scheduleSignIn`, called from `app/sender/page.tsx` | SEP-53 signature over a server nonce | Sign-in fails; the sender toasts "Could not sign in to the scheduler with this wallet" and plans stay device-local |
| Travel Rule lifecycle read + Notabene sandbox send | `app/regulator/page.tsx` (`scheduleSignIn` twice) | same bearer flow | Both refuse; the regulator UI reports it could not authorize |
| idOS reusable KYC (enclave sign-in and the sharing binding message) | `components/idos/IdosConnect.tsx` | SEP-53 signature | Hidden for passkey wallets, replaced by an explanation |
| Reclaim zkTLS proof | `components/WalletBar.tsx` -> `app/api/reclaim/route.ts` | binds the proof to a `G…` key; the route rejects anything else with a 400 | Hidden for passkey wallets, same explanation |
| SEP-10 anchor auth (SEP-24 off-ramp, SEP-12 KYC, SEP-38 quotes) | `lib/stellar.ts` `anchorAuth` | signs a classic challenge transaction | `signTransaction` throws with "connect a keypair wallet for this step" |
| USDC trustline | `lib/stellar.ts` `addUsdcTrustline` | classic `changeTrust` | Not needed and not attempted: a contract account holds USDC as a SAC balance |
| CCTP burn / Blend supply | `lib/cctp.ts`, `lib/blend.ts` | classic + Soroban signing via `signTransaction` | Same throw |

The WalletBar states this verbatim under "Verify identity to enable deposits":

> Not available for a passkey wallet: idOS signs in with an ed25519 message signature (SEP-53) and
> Reclaim binds its proof to a G-address; a passkey contract account has neither. The scheduler
> sign-in has the same limit. Connect Freighter, xBull, Lobstr or Hana for those steps.

### 3.3 Not verified

- **A real device.** Everything here used a CDP *virtual* authenticator on `localhost`. Touch ID,
  Face ID, Windows Hello and hardware keys were not exercised; section 5 has the manual steps.
- **Cross-device / cross-browser passkeys.** The relying-party id defaults to the page's domain, so a
  passkey created on `localhost:3260` is not the same passkey as one created on the production
  domain. Not tested on the deployed site.
- **Firefox / Safari.** Only headless Chromium was driven. The button and the WebAuthn calls are
  standard, but the ceremonies were not run in those engines.
- **A pool deposit or withdrawal from a passkey wallet.** Blocked twice over: by 3.1, and because a
  fresh `C…` address is not on the ASP allow-list, so the compliance proof cannot be built for it.

---

## 4. Getting a relayer key

`OZ_CHANNELS_API_KEY` is server-only. It must never be `NEXT_PUBLIC_`, and the browser never sees it:
the only caller is `app/api/passkey/send/route.ts`.

```
GET https://channels.openzeppelin.com/testnet/gen     -> 201, returns a fresh testnet key
GET https://channels.openzeppelin.com/gen             -> the mainnet equivalent
```

(The testnet endpoint was checked live and returned **HTTP 201**.) Put the value in
`webapp/.env.local` for local runs and in the Vercel project's environment for deploys. It is
already set in both. Without it the route returns `{ configured: false }` and the UI says the
relayer is not configured on this deployment.

### CSP

`webapp/next.config.mjs` deliberately does **not** list `channels.openzeppelin.com` in `connect-src`,
and it should stay that way. The browser never reaches the relayer: `lib/passkey.ts` only ever
fetches same-origin `/api/passkey/send`, and the `PasskeyKit` is constructed with just
`{ rpcUrl, networkPassphrase, walletWasmHash, storage }`, with no relayer and no indexer. The Mercury
passkey-indexer (`*.mercurydata.app`) is likewise not reachable from the browser here: it is only
instantiated when a `MercuryIndexer` is explicitly constructed or a `getContractId` callback is
passed to `connectWallet`, and this app does neither. Verified by the headless run: the only network
traffic the passkey flow generated was to `soroban-testnet.stellar.org` and same-origin, with no CSP
violations in the console.

If either of those changes (say, indexer-backed signer discovery is added), the corresponding host
must be added to `connect-src`, because a missing entry fails silently in production.

---

## 5. Doing a real end-to-end test on a device with a passkey

You need a device with a platform authenticator (Touch ID / Face ID / Windows Hello) or a hardware
security key, and a browser that supports WebAuthn resident credentials.

1. `cd webapp && npm run build && npx next start -p 3260`
   (`OZ_CHANNELS_API_KEY` must be in `webapp/.env.local`; `next start` loads it.)
   WebAuthn needs a secure context: `http://localhost` counts, any other host needs HTTPS.
2. Open `http://localhost:3260/sender`.
3. Click **New passkey wallet**. Approve the registration prompt.
   Expect toasts: "register a passkey in your browser…", then
   "smart wallet deployed, fee paid by the relayer (tx `<8 hex chars>`…)", then
   "sending test USDC to your smart wallet…", then "passkey wallet ready".
4. The strip should read `passkey wallet · C…`. Confirm on-chain:
   - open `https://stellar.expert/explorer/testnet/tx/<the tx hash from the toast>` and check the
     fee account is the relayer's, not yours;
   - `stellar contract invoke --id <USDC SAC> --network testnet -- balance --id <your C-address>`
     should show `1000000000` (100 USDC).
5. Reload the page. It must reconnect to the same `C…` address **without** a second biometric prompt.
6. Click **Disconnect**, then **Sign in with passkey**. Pick the passkey; you must land on the same
   `C…` address.
7. Open the "Verify identity to enable deposits" disclosure. It must show the SEP-53 explanation, not
   the idOS/Reclaim controls.
8. Expected to fail today (see 3.1): attempting a pool deposit from this wallet. It should surface
   "The fee relayer cannot yet decode the auth entry a passkey signs…", not a raw XDR error.

To repeat the headless version instead, drive Playwright with a CDP virtual authenticator:
`WebAuthn.enable`, then `WebAuthn.addVirtualAuthenticator` with
`{ protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }`,
then click the same buttons. That is exactly how section 2.4 was produced.

Note: `next dev` cannot be used for this. The app's own CSP has no `'unsafe-eval'`, and Next's dev
HMR runtime uses `eval`, so client JS does not evaluate. Test against `next build` + `next start`.

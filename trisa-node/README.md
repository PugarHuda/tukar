# Tukar TRISA companion node

An always-on Go service that gives Tukar a **real** [TRISA](https://trisa.io) Travel Rule
capability. TRISA is one of the two live FATF Travel Rule networks (the other is TRP, which
Tukar already speaks from its serverless routes). TRISA needs two things a serverless
function cannot provide:

1. A **stable, mutual-TLS gRPC endpoint** that other VASPs dial to send you a transfer.
2. **Long-lived X.509 certificates** issued by the Global TRISA Directory (GDS), used both
   to authenticate the mTLS connection and to seal/unseal the IVMS101 envelope.

This node hosts both. It is the serverless&harr;TRISA gap: the Next.js app calls the node
over a localhost HTTP bridge, and the node performs the real VASP-to-VASP exchange.

## What is automated vs what you must do

The code, Docker image, deploy config, webapp integration, and this guide are done. Three
steps **cannot** be automated and are yours:

| Step | Who | Why |
| --- | --- | --- |
| Build + compile the node (`go build ./...`) | Automated | Real `github.com/trisacrypto/trisa` dependency, pinned. |
| Register a test VASP on trisatest.net, pass the KYV review | **You** | A human review by the directory; no self-serve API. |
| Obtain + install the issued certificates | **You** | The GDS issues a PKCS12 archive to your registered contact. |
| Deploy to a public host with a stable endpoint | **You** | Needs a real host + DNS; no invented endpoint is shipped. |

Until those three are done the node has no certs to load and will not start, and the webapp
route reports `configured:false` and falls back to TRP. **No certs, keys, or running
endpoint are faked anywhere in this repo.**

## Architecture

```
Next.js (serverless)                         trisa-node (always-on Go)                 TRISA network
--------------------                         -------------------------                 -------------
regulator Travel Rule tab
   |  POST /api/travel-rule/trisa
   v
app/api/travel-rule/trisa/route.ts  --HTTP-->  POST /trisa/transfer (localhost bridge)
   (gated on TRISA_NODE_URL)                        |  GDS Lookup(commonName) ----------> api.trisatest.net:443
                                                    |  KeyExchange / seal IVMS101
                                                    |  Transfer (mTLS gRPC) ------------> api.bob.vaspbot.net:443
                                                    v
                                         inbound mTLS gRPC server  <-------------------- peers dial you back
                                         Transfer / KeyExchange
```

- **gRPC server** (`node.go`, `main.go`): implements `TRISANetwork` (`Transfer`,
  `KeyExchange`) behind mTLS. `Transfer` unseals with your private key, validates the
  IVMS101 identity, and returns a compliant response sealed back to the caller.
- **Client** (`node.go` `SendTransfer`): looks the counterparty up in the GDS, exchanges
  keys, seals the IVMS101 payload, and sends a `Transfer`.
- **HTTP bridge** (`bridge.go`): `POST /trisa/transfer` and `GET /healthz`, bound to
  localhost so the Next.js app can drive the node.
- **IVMS101** (`ivms.go`): builds/validates the identity payload. A full protojson IVMS101
  body is used as-is; anything else (including Tukar's own IVMS101-shaped JSON) falls back to
  a structurally valid placeholder identity, because Tukar keeps PII off-ledger and the
  anchors hold the real KYC out of band.

### TRISA APIs used (all from `github.com/trisacrypto/trisa@v1.7.0`)

| Concern | Package / symbol |
| --- | --- |
| gRPC service | `pkg/trisa/api/v1beta1` — `RegisterTRISANetworkServer`, `TRISANetworkServer`, `SecureEnvelope`, `Payload`, `Error`, `Errorf` |
| Envelope seal/unseal | `pkg/trisa/envelope` — `Seal`, `Open`, `Reject`, `WithRSAPublicKey`, `WithRSAPrivateKey`, `WithEnvelopeID`, `Envelope.Payload/Proto` |
| IVMS101 | `pkg/ivms101` — `IdentityPayload` (+ `protojson`) |
| Transaction | `pkg/trisa/data/generic/v1beta1` — `Transaction` |
| mTLS | `pkg/trisa/mtls` — `ServerCreds`, `ClientCreds` |
| Certs / trust chain | `pkg/trust` — `NewSerializer`, `Serializer.ReadFile/ReadPoolFile`, `Provider.GetRSAKeys/GetLeafCertificate`, `ProviderPool` |
| Directory + peer dial | `pkg/trisa/peers` — `New`, `Peers.Lookup`, `Peer.ExchangeKeys`, `Peer.Transfer`, `Peers.FromContext` |
| GDS testnet endpoint | `api.trisatest.net:443` (from the reference CLI `cmd/trisa/main.go`) |

The client flow (lookup &rarr; key exchange &rarr; seal &rarr; transfer) mirrors the module's
own reference CLI at `cmd/trisa/main.go`.

## 1. Register a test VASP on trisatest.net

1. Go to the TestNet directory registration UI: **https://trisatest.net** (the TestNet GDS;
   docs at https://trisa.dev/joining-trisa/).
2. Complete the registration form for a **test** VASP: legal entity details, a TRISA endpoint
   (the public `host:port` this node will run on, e.g. `tukar-trisa.fly.dev:443`), and a
   technical contact email.
3. Choose the certificate delivery method. The GDS issues **PKCS12-encrypted** certificates;
   the password is delivered to your contact separately.
4. Submit. The directory runs a **KYV (Know-Your-VASP)** review. This is a human step and is
   not instant. TestNet approval is lenient but still manual.
5. On approval you receive a certificate archive (a `.zip` / PKCS12 bundle) containing your
   identity certificate, private key, and the trust chain.

> TestNet only. Do not point this at the MainNet directory (`vaspdirectory.net`) for testing.

## 2. Install certs and configure env

```bash
cp .env.example .env
mkdir -p certs
# copy the issued archive into ./certs, e.g. certs/trisa.identity.zip
```

Edit `.env`:

- `TRISA_CERTS=./certs/trisa.identity.zip` — path to the issued archive.
- `TRISA_CERTS_PASSWORD=...` — the PKCS12 password (if the archive is encrypted).
- `TRISA_COMMON_NAME=...` — your registered common name (must match the cert).
- `DIRECTORY=api.trisatest.net:443` — the TestNet GDS lookup endpoint (default).
- `LISTEN_ADDR=:4433`, `BRIDGE_ADDR=127.0.0.1:8091` — defaults are fine locally.

## 3. Run locally

```bash
go build ./...            # compiles against the real trisa module
go test ./...             # identity build/validate self-check
set -a; . ./.env; set +a  # load env
go run .
```

Health check:

```bash
curl http://127.0.0.1:8091/healthz
# {"status":"ok","directory":"api.trisatest.net:443","listen":":4433","commonName":"..."}
```

## 4. Test against the Alice / Bob rVASPs

TRISA runs public test peers ("rVASPs") named Alice and Bob. Their current endpoints are
listed at **https://trisa.dev/testing/rvasps/** — check that page for the exact host, since
the domain has moved between `vaspbot.net` and `vaspbot.com` over time. Common names look
like `api.bob.vaspbot.net` (or `.com`).

Originate a transfer from your node to a test peer:

```bash
curl -X POST http://127.0.0.1:8091/trisa/transfer \
  -H 'content-type: application/json' \
  -d '{
    "beneficiaryVASP": "api.bob.vaspbot.net",
    "amount": 250.00,
    "network": "Stellar",
    "asset": "USDC",
    "ivms101": {}
  }'
```

The node does a real GDS `Lookup`, `KeyExchange`, seals the IVMS101 envelope, and sends a
`Transfer`. You get back the envelope id, transfer state, and the peer's `ReceivedAt`, or a
TRISA rejection reason if the peer declines.

To have an rVASP dial **your** node (exercising the inbound mTLS server), use the rVASP admin
API with its "external demo" flag pointing at your registered endpoint — see the rVASP docs
above. Your node must be deployed and registered first (steps 1 and 5).

## 5. Deploy (Fly.io)

The node needs a stable public endpoint. `fly.toml` is included and passes **raw TCP**
through to the node (Fly must not terminate TLS; the node does mutual TLS end to end).

```bash
fly launch --no-deploy                 # creates the app (or: fly apps create tukar-trisa-node)
fly volumes create trisa_certs --size 1
fly secrets set TRISA_CERTS_PASSWORD=... # PKCS12 password
# install the issued cert archive into the /certs volume (fly ssh / a one-off machine)
fly deploy
```

Register the resulting endpoint (e.g. `tukar-trisa.fly.dev:443`) as your TRISA endpoint in
the GDS if you did not already in step 1. Railway or any host that exposes a raw TCP port
works too; the only requirement is a stable inbound `host:port` for mTLS gRPC.

> The HTTP bridge is bound to localhost and has no auth of its own. Do not expose it
> publicly. For a split webapp/node deployment, reach it over a private network or front it
> with your own auth, and set `BRIDGE_ADDR` accordingly.

## 6. Wire the webapp

Set `TRISA_NODE_URL` in the Next.js environment to the node's bridge, e.g. for local dev:

```
TRISA_NODE_URL=http://127.0.0.1:8091
```

Then in the regulator console &rarr; Travel Rule tab, "Send via TRISA (companion node)"
performs a real TRISA transfer. Without `TRISA_NODE_URL` the route returns
`{configured:false}` and the UI tells you to use the TRP send instead. The webapp route
(`webapp/app/api/travel-rule/trisa/route.ts`) reads `TRISA_NODE_URL` directly.

## Honest boundary

- The Go code is real and compiles against the real TRISA module; the protocol flow (mTLS,
  GDS lookup, envelope sealing, `Transfer`) is genuine.
- It does **nothing** until you register a VASP, pass KYV, install issued certs, and deploy
  to a public endpoint. Those are manual and gated by the directory operator.
- No certificates, keys, or endpoints are bundled or invented. The placeholder IVMS101
  identity is clearly labelled and exists only because Tukar keeps PII off-ledger; swap in a
  full protojson IVMS101 body when the anchors provide real KYC.
```

# idOS issuer request email (ready to send)

To: engineering@idos.network
Subject: Trusting an idOS testnet issuer for a live Stellar KYC-reuse consumer (Tukar)

---

Hi idOS team,

I'm building Tukar, a private cross-border remittance app on Stellar that uses idOS for reusable
KYC, so a sender who already completed KYC elsewhere can reuse that credential instead of verifying
again. I've integrated the idOS consumer SDK (@idos-network v1.5.0) against your playground testnet
and it is working end to end on our side: the app initializes the enclave, checks hasProfile, lists
and filters credentials, and requests an access grant on the client; the server then reads the
granted credential and runs verifyCredential before adding the sender's address to our compliance
allow-list.

The one piece I am missing to complete the full share -> verifyCredential -> allow-list flow is a
credential from an issuer I can trust. Today verifyCredential has no accepted issuer to check
against on testnet, so I cannot close the loop with a real credential.

Could you help with either of these:

1. A testnet issuer we can add to our accepted-issuers list, specifically its issuer authPublicKey
   and publicKeyMultibase, ideally one that can seed a demo credential into a test idOS profile we
   control so we can run the grant end to end.
2. Guidance on the supported path for a consumer to obtain or trust a testnet-issued credential, and
   whether there is a public playground issuer intended for exactly this.

Our consumer details (idOS playground testnet):

- Node: https://nodes.playground.idos.network
- Consumer auth public key: 299EDD683EC70703640B1A63B4DA4D8D96B1085E641D64F81D0FEA063412FD11
- Consumer encryption public key: WR6T5hqTPjaPF51ral9nwXyTVLTGP3DFbi1r+tgPMl0=

For context, Tukar placed 5th in the Stellar Privacy / Real-World ZK hackathon and is an APAC
hackathon grand finalist, and we are applying to the Stellar Community Fund. Reusable KYC via idOS
is a core part of our compliance story, so getting this flow fully live on testnet matters a lot to
us.

Happy to share the repository, a live demo link, or hop on a quick call. Thank you very much for the
help.

Best regards,
Pugar Huda Mantoro
hudapugar@gmail.com

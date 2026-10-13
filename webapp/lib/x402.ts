import { StrKey } from "@stellar/stellar-sdk";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { PaymentRequirements } from "@x402/core/types";
import { STELLAR_TESTNET_CAIP2, USDC_TESTNET_ADDRESS } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/server";

// x402 (HTTP 402 Payment Required, protocol v2) on Stellar testnet, via the public x402.org
// facilitator: it lists `stellar:testnet` / `exact` with fees sponsored and needs no API key.
// The payer signs a Soroban auth entry for a USDC SAC `transfer(payer -> payTo, amount)`; the
// facilitator verifies it, then submits it and pays the fee.

// Fallback payee: the project's public testnet admin account (deployments/testnet.json "admin").
// A SAC transfer to a classic G-account needs a trustline for Circle testnet USDC
// (USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5) on the payee, so set
// X402_PAY_TO to an account that has one (or add the trustline to this account once).
export const DEFAULT_PAY_TO = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS";
export const DEFAULT_FACILITATOR = "https://x402.org/facilitator";
// 0.01 USDC (7 decimals) per verification.
export const PRICE_STROOPS = "100000";

export type X402Config = { payTo: string; facilitatorUrl: string; network: typeof STELLAR_TESTNET_CAIP2; asset: string; amount: string };

/** Resolve config from env. Throws on a malformed X402_PAY_TO rather than silently falling back. */
export function x402Config(env: Record<string, string | undefined> = process.env): X402Config {
  const payTo = env.X402_PAY_TO?.trim() || DEFAULT_PAY_TO;
  if (!StrKey.isValidEd25519PublicKey(payTo) && !StrKey.isValidContract(payTo))
    throw new Error("X402_PAY_TO must be a Stellar G... or C... address");
  return {
    payTo,
    facilitatorUrl: env.X402_FACILITATOR_URL?.trim() || DEFAULT_FACILITATOR,
    network: STELLAR_TESTNET_CAIP2,
    asset: USDC_TESTNET_ADDRESS,
    amount: PRICE_STROOPS,
  };
}

// ponytail: one module-level server per instance; initialize() fetches the facilitator's
// /supported once. A failed init is dropped so the next request retries instead of caching it.
let ready: Promise<{ server: x402ResourceServer; requirements: PaymentRequirements[] }> | null = null;

export function x402Server() {
  if (!ready) {
    ready = (async () => {
      const cfg = x402Config();
      const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: cfg.facilitatorUrl }));
      server.register(cfg.network, new ExactStellarScheme());
      await server.initialize();
      const requirements = await server.buildPaymentRequirements({
        scheme: "exact",
        network: cfg.network,
        payTo: cfg.payTo,
        price: { asset: cfg.asset, amount: cfg.amount },
        maxTimeoutSeconds: 120,
      });
      return { server, requirements };
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

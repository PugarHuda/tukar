import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server build (not static export) so we can host the /api/reclaim route.
  // The root vercel.json's static headers/redirects no longer apply when this app
  // is served from webapp/, so we reproduce them below via headers()/redirects().
  images: { unoptimized: true },
  // The repo root has its own package-lock; pin tracing to this app so Next doesn't
  // infer the parent as the workspace root.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // Ship the wasm/zkey circuit assets in the cron route's serverless bundle so the server
  // relayer can read them from disk (it proves compliance + amount binding + merkleUpdate).
  outputFileTracingIncludes: { "/api/cron/recurring": ["./public/circuit/**"] },
  async headers() {
    // Content-Security-Policy tuned to what the browser actually loads (verified by scripts/qa-csp.mjs).
    // Non-obvious sources, each present because real code needs it:
    //   script-src 'wasm-unsafe-eval'   -> snarkjs/circomlibjs compile the circuit WASM in-browser
    //   script-src cdn.jsdelivr.net     -> sender success screen loads qrcode-generator UMD at runtime (components/sender/qr.ts)
    //   script/style 'unsafe-inline'    -> Next.js hydration inline scripts + Tailwind/Next inline styles (nonces out of scope)
    //   worker-src blob:                -> snarkjs proof workers spawn from blob: URLs
    //   connect-src soroban-testnet     -> live Soroban RPC reads + Reflector FX oracle (lib/constants.ts RPC)
    //   connect-src open.er-api.com     -> FX-rate fallback fetch (sender/receiver/demo)
    //   connect-src friendbot           -> one-click testnet XLM funding (components/WalletProvider.tsx)
    //   connect-src sepolia.base.org    -> viem Base Sepolia public RPC for the CCTP receive leg (lib/cctp.ts)
    //   connect-src api.onramper.com    -> off-ramp quote fetch on the receiver (lib/stellar.ts onramperQuote)
    //   connect-src api.reclaimprotocol -> Reclaim session-status poll when the ASP flow is configured (components/WalletBar.tsx)
    //   connect-src *.idos.network       -> idOS reusable-KYC: kwil node reads + enclave (components/idos/IdosConnect.tsx)
    //   frame-src enclave.playground.idos.network -> the idOS enclave is an iframe mounted into #idOS-enclave
    //   connect-src *.ingest.sentry.io  -> Sentry browser SDK error/perf ingest, ONLY reached when a DSN is set (no-op otherwise)
    //   img-src https:                  -> og/explorer/remote thumbnails; media-src 'self' -> the deck /demo-id.mp4
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "media-src 'self'",
      "worker-src 'self' blob:",
      "connect-src 'self' https://soroban-testnet.stellar.org https://open.er-api.com https://friendbot.stellar.org https://sepolia.base.org https://api.onramper.com https://api.reclaimprotocol.org https://nodes.playground.idos.network https://enclave.playground.idos.network https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
      "frame-src 'self' https://enclave.playground.idos.network",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        // Safe baseline hardening on every route: block clickjacking, stop MIME sniffing, trim
        // referrer leakage, and a real CSP that permits exactly the origins/eval the app uses.
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      {
        source: "/.well-known/stellar.toml",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Content-Type", value: "text/plain; charset=utf-8" },
        ],
      },
      {
        source: "/circuit/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/demo", destination: "/", permanent: true },
      { source: "/demo/:path*", destination: "/", permanent: true },
    ];
  },
  async rewrites() {
    // The static host used cleanUrls to serve public/deck.html at /deck. Next server mode
    // has no cleanUrls, so serve the deck at its clean URL explicitly (keeps /deck working).
    // /favicon.ico: browsers auto-probe it; we ship an SVG icon, so map the probe to it to
    // avoid a cosmetic 404 on every page (declared icons icon.svg/icon-192 already resolve).
    return [
      { source: "/deck", destination: "/deck.html" },
      { source: "/favicon.ico", destination: "/icon.svg" },
    ];
  },
  webpack: (config, { isServer }) => {
    // snarkjs + circomlibjs reference Node builtins that don't exist in the browser.
    // Dynamic-imported client-side, so stub them out for the browser bundle.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        os: false,
        stream: false,
        readline: false,
        constants: false,
        worker_threads: false,
      };
    }
    return config;
  },
};

// Wrap with Sentry's build plugin, preserving every option above. Source-map upload runs ONLY when
// SENTRY_AUTH_TOKEN is present, so a build without it (the current state) still succeeds. The
// runtime SDK stays a no-op until NEXT_PUBLIC_SENTRY_DSN is set (see the sentry.*.config files).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

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
    return [
      {
        // Safe baseline hardening on every route: block clickjacking, stop MIME sniffing, trim
        // referrer leakage. Intentionally NOT a full CSP yet (the app loads inline styles + the
        // deck media, so a strict policy needs its own testing pass before it ships).
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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

export default nextConfig;

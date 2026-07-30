import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The repo root has its own package-lock; pin tracing to this app so Next doesn't
  // infer the parent as the workspace root.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
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

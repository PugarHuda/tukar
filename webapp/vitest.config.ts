import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Node environment: the lib money-math is pure (no DOM). TS is handled by esbuild,
// which vitest bundles. Only the pure functions are exercised here — anything needing
// Soroban RPC, a wallet, or crypto.subtle is out of scope (see the test files).
//
// API route handlers are plain functions over Request/Response, so the security-relevant ones are
// tested the same way (app/api/**/route.test.ts). Those need the two aliases Next resolves for
// itself outside a Next build: "@/..." (tsconfig paths) and "server-only", which Next maps to its
// own no-op module.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname),
      "server-only": "next/dist/compiled/server-only/empty.js",
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
});

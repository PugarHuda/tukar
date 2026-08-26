import { defineConfig } from "vitest/config";

// Node environment: the lib money-math is pure (no DOM). TS is handled by esbuild,
// which vitest bundles. Only the pure functions are exercised here — anything needing
// Soroban RPC, a wallet, or crypto.subtle is out of scope (see the test files).
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});

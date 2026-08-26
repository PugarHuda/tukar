import { describe, it, expect, beforeEach, vi } from "vitest";

// Guards the honest degradation the task requires: with the consumer public keys ABSENT the client
// must report not-configured (UI shows a "not configured" state, no crash); with them PRESENT it
// reports configured. The keys are read at module load, so reset the module registry per case.
describe("idosClientConfigured gating", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_IDOS_CONSUMER_AUTH_PUBLIC_KEY;
    delete process.env.NEXT_PUBLIC_IDOS_CONSUMER_ENCRYPTION_PUBLIC_KEY;
  });

  it("is false when the consumer public keys are absent", async () => {
    const { idosClientConfigured } = await import("./config");
    expect(idosClientConfigured).toBe(false);
  });

  it("is false when only one key is present", async () => {
    process.env.NEXT_PUBLIC_IDOS_CONSUMER_AUTH_PUBLIC_KEY = "abc";
    const { idosClientConfigured } = await import("./config");
    expect(idosClientConfigured).toBe(false);
  });

  it("is true when both consumer public keys are present", async () => {
    process.env.NEXT_PUBLIC_IDOS_CONSUMER_AUTH_PUBLIC_KEY = "abc";
    process.env.NEXT_PUBLIC_IDOS_CONSUMER_ENCRYPTION_PUBLIC_KEY = "def";
    const { idosClientConfigured } = await import("./config");
    expect(idosClientConfigured).toBe(true);
  });
});

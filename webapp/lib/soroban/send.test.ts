import { describe, it, expect } from "vitest";
import { sendTx } from "./send";

// Only the RPC boundary is faked: `at.signAndSend` (the SDK object sendTx drives) and
// `rpc.getTransaction` (what sendTx polls once a hash exists).
const HASH = "ab".repeat(32);

function fakeAt(behaviour: (watcher: any) => Promise<any>) {
  return { signAndSend: (opts: any) => behaviour(opts?.watcher) };
}

describe("sendTx", () => {
  it("hash exists, SDK poll blips, our poll says SUCCESS: returns the hash, never resubmits", async () => {
    let builds = 0;
    const buildAt = async () => {
      builds++;
      return fakeAt(async (watcher) => {
        watcher.onSubmitted({ status: "PENDING", hash: HASH });
        throw new TypeError("fetch failed"); // the SDK's getTransaction poll dying mid-flight
      });
    };
    const polls: string[] = [];
    const rpc = {
      getTransaction: async (h: string) => {
        polls.push(h);
        return polls.length < 2 ? { status: "NOT_FOUND" } : { status: "SUCCESS", txHash: h };
      },
    };
    const res = await sendTx(buildAt, 5, rpc, 1);
    expect(res.sendTransactionResponse.hash).toBe(HASH);
    expect(res.getTransactionResponse.status).toBe("SUCCESS");
    expect(builds).toBe(1);
    expect(polls.every((h) => h === HASH)).toBe(true);
  });

  it("hash exists and the poll says FAILED: surfaces the original error, no resubmit", async () => {
    let builds = 0;
    const buildAt = async () => {
      builds++;
      return fakeAt(async (watcher) => {
        watcher.onSubmitted({ status: "PENDING", hash: HASH });
        throw new Error("network timeout");
      });
    };
    const rpc = { getTransaction: async () => ({ status: "FAILED" }) };
    await expect(sendTx(buildAt, 5, rpc, 1)).rejects.toThrow("network timeout");
    expect(builds).toBe(1);
  });

  it("hash exists but the poll never finds it: throws with the hash, no resubmit", async () => {
    let builds = 0;
    const buildAt = async () => {
      builds++;
      return fakeAt(async (watcher) => {
        watcher.onSubmitted({ status: "PENDING", hash: HASH });
        throw new Error("fetch failed");
      });
    };
    const rpc = { getTransaction: async () => ({ status: "NOT_FOUND" }) };
    await expect(sendTx(buildAt, 5, rpc, 1)).rejects.toThrow(HASH);
    expect(builds).toBe(1);
  });

  it("pre-send transient fault (no hash): rebuilds and resubmits", async () => {
    let builds = 0;
    const buildAt = async () => {
      builds++;
      return fakeAt(async () => {
        if (builds === 1) throw new Error("Sending the transaction to the network failed! tx_bad_seq");
        return { sendTransactionResponse: { hash: HASH }, getTransactionResponse: { status: "SUCCESS" } };
      });
    };
    const rpc = { getTransaction: async () => { throw new Error("must not poll without a hash"); } };
    const res = await sendTx(buildAt, 5, rpc, 1);
    expect(res.sendTransactionResponse.hash).toBe(HASH);
    expect(builds).toBe(2);
  });

  it("contract revert is deterministic: no retry, no poll", async () => {
    let builds = 0;
    const buildAt = async () => {
      builds++;
      return fakeAt(async () => { throw new Error("HostError: Error(Contract, #10)"); });
    };
    const rpc = { getTransaction: async () => { throw new Error("must not poll"); } };
    await expect(sendTx(buildAt, 5, rpc, 1)).rejects.toThrow("#10");
    expect(builds).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { DEMO_SECRET } from "./constants";
import { signMessageWithWallet, checkNetwork, clearNetworkGuard, assertNetwork } from "./wallet-kit";

describe("signMessageWithWallet", () => {
  it("demo kind signs the SEP-53 payload with the built-in key (verifies like lib/auth does)", async () => {
    const kp = Keypair.fromSecret(DEMO_SECRET);
    const nonce = "abc.def";
    const sig = await signMessageWithWallet(nonce, kp.publicKey(), "demo");
    const hash = createHash("sha256").update("Stellar Signed Message:\n" + nonce, "utf8").digest();
    expect(Keypair.fromPublicKey(kp.publicKey()).verify(hash, Buffer.from(sig, "base64"))).toBe(true);
    // A different message must not verify against the same signature.
    const other = createHash("sha256").update("Stellar Signed Message:\nxyz", "utf8").digest();
    expect(kp.verify(other, Buffer.from(sig, "base64"))).toBe(false);
  });

  it("passkey kind refuses SEP-53 honestly (contract account, no ed25519 key)", async () => {
    await expect(signMessageWithWallet("m", "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "passkey")).rejects.toThrow(/passkey smart wallet cannot sign messages/);
  });

  it("network guard blocks kit signing while the wallet is off Testnet, and clears", async () => {
    const mainnet = { getNetwork: async () => ({ network: "Public", networkPassphrase: "Public Global Stellar Network ; September 2015" }) };
    expect(await checkNetwork(mainnet as any)).toBe("Public");
    await expect(signMessageWithWallet("m", "GABC", "freighter")).rejects.toThrow(/switch it to Testnet/);
    const testnet = { getNetwork: async () => ({ network: "Testnet", networkPassphrase: "Test SDF Network ; September 2015" }) };
    expect(await checkNetwork(testnet as any)).toBeNull();
    expect(() => assertNetwork()).not.toThrow();
    // Modules that cannot report a network (Albedo, Rabet, Ledger) never block.
    const mute = { getNetwork: async () => { throw { code: -3, message: "unsupported" }; } };
    expect(await checkNetwork(mute as any)).toBeNull();
    clearNetworkGuard();
    expect(() => assertNetwork()).not.toThrow();
  });
});

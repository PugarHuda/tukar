import { describe, it, expect } from "vitest";
import { Account, Address, BASE_FEE, Keypair, Operation, TransactionBuilder, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { PASSPHRASE, POOL } from "./constants";
import { PasskeyServer } from "passkey-kit/server";
import { PASSKEY_UNAVAILABLE, passkeyKit, createPasskeyWallet, connectPasskeyWallet } from "./passkey";

// Passkey wallets are switched off in this build because passkey-kit cannot read Protocol 28 XDR on
// @stellar/stellar-sdk 17 (docs/PASSKEY.md 3.1). Two things are worth holding: that every way into
// the library refuses in plain language rather than throwing a raw TypeError at the user, and that
// the reason is still true upstream.

describe("passkey entry points while the feature is off", () => {
  it("refuse in plain language, not with a library TypeError", async () => {
    for (const call of [() => passkeyKit(), () => createPasskeyWallet("x"), () => connectPasskeyWallet("k")]) {
      await expect(call()).rejects.toThrow(PASSKEY_UNAVAILABLE);
    }
    // The message is what the user sees, so it has to name a way forward...
    expect(PASSKEY_UNAVAILABLE).toMatch(/testnet key|Freighter/);
    // ...and must not be the shape of the underlying library failure.
    expect(PASSKEY_UNAVAILABLE).not.toMatch(/is not a function|switch\(\)/);
  });
});

// The canary for the fix we could NOT make: the day passkey-kit reads js-xdr v5, this fails and the
// feature can be switched back on (drop PASSKEY_SUPPORTED in lib/passkey.ts, restore the two buttons
// in components/WalletBar.tsx and the passkey branch of the reload path in WalletProvider.tsx).
// Runs the real PasskeyServer.send that app/api/passkey/send/route.ts calls, against the installed
// package and the installed SDK. It throws while reading the auth entry, before any network call, so
// the relayer settings below are never used and nothing is mocked.
describe("installed passkey-kit against the installed stellar-sdk", () => {
  it("still cannot read an auth entry this app builds", async () => {
    const credentials = xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(Keypair.random().publicKey()).toScAddress(),
        nonce: xdr.Int64.fromString("1"),
        signatureExpirationLedger: 100,
        signature: xdr.ScVal.scvVoid(),
      }),
    );
    // SDK 17 (js-xdr v5) exposes a union's arm as `.type`; passkey-kit still calls `.switch()`.
    expect(credentials.type).toBe("sorobanCredentialsAddress");

    const entry = new xdr.SorobanAuthorizationEntry({
      credentials,
      rootInvocation: new xdr.SorobanAuthorizedInvocation({
        function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
          new xdr.InvokeContractArgs({
            contractAddress: new Address(POOL).toScAddress(),
            functionName: "deposit",
            args: [],
          }),
        ),
        subInvocations: [],
      }),
    });
    // The auth has to go in at build time: Transaction.toXDR() re-encodes the stored envelope, so
    // assigning to operations[0].auth afterwards would be silently dropped.
    const tx = new TransactionBuilder(new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"), {
      fee: BASE_FEE,
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func: xdr.HostFunction.hostFunctionTypeInvokeContract(
            new xdr.InvokeContractArgs({
              contractAddress: new Address(POOL).toScAddress(),
              functionName: "deposit",
              args: [nativeToScVal(1n, { type: "i128" })],
            }),
          ),
          auth: [entry],
        }),
      )
      .setTimeout(300)
      .build();

    const relayer = new PasskeyServer({
      networkPassphrase: PASSPHRASE,
      relayer: { baseUrl: "https://relayer.invalid", apiKey: "unused-the-throw-comes-first" },
    });
    await expect(relayer.send(tx.toXDR())).rejects.toThrow(/is not a function/);
  });
});

"use client";

// Lazy singleton for @creit.tech/stellar-wallets-kit (v2.5.0, fully static API). The kit pulls in
// web-component/preact browser deps and reads localStorage at import, so it must load ONLY in the
// browser — every import here is dynamic and guarded, never at module top-level. init() is
// idempotent (guarded by _inited) so the profile-check, connect, and rehydrate paths share one kit.
//
// The six modules are the wallets Tukar advertises: Freighter, xBull, Albedo, Rabet, Lobstr, Hana.
// productId for each is a stable lowercase id ("freighter", "xbull", …) which we surface as the
// wallet `kind`; FREIGHTER_ID === "freighter" so the existing freighter-only branches keep working.
type KitStatic = (typeof import("@creit.tech/stellar-wallets-kit"))["StellarWalletsKit"];

let _inited = false;

export async function walletKit(): Promise<KitStatic> {
  const { StellarWalletsKit, Networks } = await import("@creit.tech/stellar-wallets-kit");
  if (!_inited) {
    const [freighter, xbull, albedo, rabet, lobstr, hana] = await Promise.all([
      import("@creit.tech/stellar-wallets-kit/modules/freighter"),
      import("@creit.tech/stellar-wallets-kit/modules/xbull"),
      import("@creit.tech/stellar-wallets-kit/modules/albedo"),
      import("@creit.tech/stellar-wallets-kit/modules/rabet"),
      import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
      import("@creit.tech/stellar-wallets-kit/modules/hana"),
    ]);
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      modules: [
        new freighter.FreighterModule(),
        new xbull.xBullModule(),
        new albedo.AlbedoModule(),
        new rabet.RabetModule(),
        new lobstr.LobstrModule(),
        new hana.HanaModule(),
      ],
    });
    _inited = true;
  }
  return StellarWalletsKit;
}

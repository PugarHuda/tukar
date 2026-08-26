"use client";

// Real idOS reusable-KYC consumer integration. Reads the connected wallet's EXISTING idOS KYC
// credential (minted by a trusted issuer) and reuses it here: it proves the credential to this app's
// idOS consumer, which the operator then turns into an on-chain ASP allow-list entry. Tukar never
// holds the KYC data itself. Honest about its dependency: it needs an idOS profile that already
// holds a credential from a trusted issuer — it never claims instant KYC for an arbitrary user.
//
// Two real testnet reads happen with no signing: addressHasProfile() tells you truthfully whether
// the wallet owns an idOS profile. Sharing the credential (filter + access grant) needs the enclave
// iframe and a wallet message signature, and only succeeds when such a credential actually exists.
import { useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { Button, useToast } from "@/components/ui";
import {
  IDOS_NODE_URL,
  IDOS_ENCLAVE_URL,
  IDOS_ENCLAVE_CONTAINER_ID,
  IDOS_CONSUMER_AUTH_PUBLIC_KEY,
  IDOS_CONSUMER_ENCRYPTION_PUBLIC_KEY,
  IDOS_ISSUER_AUTH_PUBLIC_KEY,
  idosClientConfigured,
} from "@/lib/idos/config";

const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

type AllowlistInfo = {
  alreadyListed: boolean;
  leafIndex: number;
  setAspRootCli: string;
};

type State =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "no-profile" }
  | { phase: "has-profile" }
  | { phase: "sharing"; step: string }
  | { phase: "shared"; verified: boolean; reason?: string; allowlist?: AllowlistInfo }
  | { phase: "error"; message: string };

// Lazy Freighter import (matches WalletProvider) so a missing extension never breaks boot.
async function freighter(): Promise<any> {
  const mod: any = await import("@stellar/freighter-api");
  return mod.default ?? mod;
}

// Build the idOS user signer for a Stellar (Freighter) wallet. In @idos-network/client 1.5.0 a
// Stellar user signer is a CustomKwilSigner (publicAddress + publicKey + signatureType + walletType
// + signMessage). The identifier is the hex ed25519 public key, and kwil verifies the signature via
// @stellar/stellar-sdk. signMessage mirrors the idOS reference (apps/idos-data-dashboard signers.ts):
// pass base64(message) to the wallet and decode the base64 signature (handling the double-encode
// quirk). ponytail: this leg runs only in-browser for a real credential-holding user; not headless.
async function makeStellarSigner(address: string) {
  const { StrKey } = await import("@stellar/stellar-sdk");
  const f = await freighter();
  const hexPublicKey = Buffer.from(StrKey.decodeEd25519PublicKey(address)).toString("hex");
  return {
    publicAddress: hexPublicKey,
    publicKey: hexPublicKey,
    signatureType: "ed25519",
    walletType: "Stellar",
    signMessage: async (msg: Uint8Array): Promise<Uint8Array> => {
      const messageBase64 = Buffer.from(msg).toString("base64");
      const res: any = await f.signMessage(messageBase64, { address });
      if (res?.error) throw new Error(res.error.message || String(res.error));
      let signed = Buffer.isBuffer(res.signedMessage)
        ? (res.signedMessage as Buffer)
        : Buffer.from(res.signedMessage, "base64");
      if (signed.length > 64) signed = Buffer.from(signed.toString(), "base64");
      return new Uint8Array(signed);
    },
  };
}

export function IdosConnect() {
  const { address, kind } = useWallet();
  const { toast } = useToast();
  const [state, setState] = useState<State>({ phase: "idle" });
  // The idle client is reused across the profile check and the share flow.
  const idleRef = useRef<any>(null);

  if (!idosClientConfigured) {
    return (
      <p className="mt-1 text-left leading-relaxed text-tf">
        idOS reusable KYC is not configured on this deployment yet.
      </p>
    );
  }

  async function idle() {
    if (idleRef.current) return idleRef.current;
    const { createIDOSClient } = await import("@idos-network/client");
    const config = createIDOSClient({
      nodeUrl: IDOS_NODE_URL,
      enclaveOptions: { container: `#${IDOS_ENCLAVE_CONTAINER_ID}`, url: IDOS_ENCLAVE_URL },
    });
    idleRef.current = await config.createClient();
    return idleRef.current;
  }

  // REAL testnet read, no signing: does this wallet own an idOS profile? A Stellar wallet may be
  // keyed by its G-address or by the hex ed25519 public key, so check both and report truthfully.
  async function checkProfile() {
    if (!address) return;
    setState({ phase: "checking" });
    try {
      const client = await idle();
      const forms = [address];
      try {
        const { StrKey } = await import("@stellar/stellar-sdk");
        forms.push(Buffer.from(StrKey.decodeEd25519PublicKey(address)).toString("hex"));
      } catch {
        // Non-Stellar address form; the G-address check still runs.
      }
      const results = await Promise.all(forms.map((a) => client.addressHasProfile(a)));
      setState({ phase: results.some(Boolean) ? "has-profile" : "no-profile" });
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "idOS profile check failed" });
    }
  }

  // Browser-only + credential-dependent: log in with the wallet, find a KYC credential from the
  // trusted issuer, grant this consumer access to it, then verify it server-side and compute the
  // allow-list update. Only completes when the wallet actually holds such a credential.
  async function shareCredential() {
    if (!address) return;
    if (kind !== "freighter") {
      setState({ phase: "error", message: "Connect Freighter to sign the idOS access grant (the shared testnet key cannot)." });
      return;
    }
    if (!IDOS_ISSUER_AUTH_PUBLIC_KEY) {
      setState({ phase: "error", message: "No trusted issuer configured, so a KYC credential cannot be matched on this deployment yet." });
      return;
    }
    try {
      setState({ phase: "sharing", step: "signing in to idOS" });
      const client = await idle();
      const signer = await makeStellarSigner(address);
      const withSigner = await client.withUserSigner(signer);
      const loggedIn = await withSigner.logIn();

      setState({ phase: "sharing", step: "looking for a KYC credential" });
      const credentials = await loggedIn.filterCredentials({
        acceptedIssuers: [{ authPublicKey: IDOS_ISSUER_AUTH_PUBLIC_KEY }],
      });
      if (!credentials || credentials.length === 0) {
        setState({ phase: "shared", verified: false, reason: "This idOS profile has no credential from the trusted issuer." });
        return;
      }

      setState({ phase: "sharing", step: "granting access to this app" });
      const shared = await loggedIn.requestAccessGrant(credentials[0].id, {
        consumerEncryptionPublicKey: IDOS_CONSUMER_ENCRYPTION_PUBLIC_KEY,
        consumerAuthPublicKey: IDOS_CONSUMER_AUTH_PUBLIC_KEY,
      });

      setState({ phase: "sharing", step: "verifying server-side" });
      const res = await fetch("/api/idos/credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedCredentialId: shared.id, address }),
      });
      const data = await res.json();
      if (data.configured === false) {
        setState({ phase: "error", message: "idOS is not configured on the server." });
        return;
      }
      setState({ phase: "shared", verified: !!data.verified, reason: data.reason, allowlist: data.allowlist ?? undefined });
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Sharing the idOS credential failed" });
    }
  }

  return (
    <div className="mt-2 text-left">
      <p className="leading-relaxed text-tm">
        Reads your existing idOS KYC credential to reuse it here. Needs an idOS profile with a
        credential from a trusted issuer; the operator then adds you to the on-chain allow-list.
      </p>

      {(state.phase === "idle" || state.phase === "checking") && (
        <Button variant="subtle" busy={state.phase === "checking"} onClick={checkProfile} disabled={!address}>
          {state.phase === "checking" ? "Checking idOS profile" : "Check idOS profile"}
        </Button>
      )}
      {!address && state.phase === "idle" && (
        <p className="mt-1 text-tf">Connect a wallet first.</p>
      )}

      {state.phase === "no-profile" && (
        <p className="mt-1 leading-relaxed text-tm">
          This wallet has no idOS profile. Create one and get a KYC credential from a trusted issuer
          at{" "}
          <a href="https://idos.network" target="_blank" rel="noopener noreferrer" className="underline hover:text-orange">
            idOS
          </a>
          , then check again.
        </p>
      )}

      {state.phase === "has-profile" && (
        <div className="mt-1">
          <p className="leading-relaxed text-green-t">✓ This wallet owns an idOS profile.</p>
          <div className="mt-2">
            <Button variant="subtle" onClick={shareCredential}>
              Reuse my idOS KYC credential
            </Button>
          </div>
        </div>
      )}

      {state.phase === "sharing" && (
        <p className="mt-1 leading-relaxed text-tm">Working: {state.step}… Approve the prompts in Freighter and the idOS window.</p>
      )}

      {state.phase === "shared" && !state.verified && (
        <p className="mt-1 leading-relaxed text-tm">
          {state.reason || "No trusted idOS KYC credential was found for this wallet."}
        </p>
      )}

      {state.phase === "shared" && state.verified && (
        <div className="mt-1 leading-relaxed">
          <p className="font-semibold text-green-t">✓ idOS KYC credential verified</p>
          {state.allowlist?.alreadyListed && (
            <p className="mt-1 text-tm">
              This account is already on the ASP allow-list (leaf #{state.allowlist.leafIndex}). It can deposit now.
            </p>
          )}
          {state.allowlist && !state.allowlist.alreadyListed && (
            <div className="mt-1">
              <p className="text-tm">
                To enable deposits, the corridor operator applies this on-chain (admin-gated,{" "}
                <code className="text-orange">set_asp_root</code>). The new root and witness are computed server-side; nothing here is signed.
              </p>
              <div className="mt-2 flex items-start gap-2">
                <pre className="flex-1 overflow-x-auto rounded-tile border border-line bg-black/30 p-2 font-mono text-[11px] leading-relaxed text-ts">
                  {state.allowlist.setAspRootCli}
                </pre>
                <Button
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(state.allowlist!.setAspRootCli);
                    toast("set_asp_root CLI copied", "success");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}
          {address && !state.allowlist && (
            <p className="mt-1 text-tf">Credential verified for {shortAddr(address)}. Allow-list update was not computed.</p>
          )}
        </div>
      )}

      {state.phase === "error" && <p className="mt-1 leading-relaxed text-red-t">idOS error: {state.message}</p>}

      {/* The idOS enclave iframe mounts here; the SDK controls its visibility. */}
      <div id={IDOS_ENCLAVE_CONTAINER_ID} />
    </div>
  );
}

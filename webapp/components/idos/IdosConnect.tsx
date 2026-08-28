"use client";

// Real idOS reusable-KYC consumer integration. Reads the connected wallet's EXISTING idOS KYC
// credential (minted by a trusted issuer) and reuses it here: it proves the credential to this app's
// idOS consumer, which the operator then turns into an on-chain ASP allow-list entry. Tukar never
// holds the KYC data itself. Honest about its dependency: it needs an idOS profile that already
// holds a credential from a trusted issuer; it never claims instant KYC for an arbitrary user.
//
// Two real testnet reads happen with no signing: addressHasProfile() tells you truthfully whether
// the wallet owns an idOS profile. Sharing the credential (filter + access grant) needs the enclave
// iframe and a wallet message signature, and only succeeds when such a credential actually exists.
import { useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { Button, useToast } from "@/components/ui";
import { Mark } from "@/components/sender/Label";
import { signMessageWithWallet } from "@/lib/wallet-kit";
import { idosBindingMessage } from "@/lib/idos/config";
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

// Build the idOS user signer for the connected Stellar wallet. In @idos-network/client 1.5.0 a
// Stellar user signer is a CustomKwilSigner (publicAddress + publicKey + signatureType + walletType
// + signMessage). The identifier is the hex ed25519 public key, and kwil verifies the signature via
// @stellar/stellar-sdk. signMessage mirrors the idOS reference (apps/idos-data-dashboard signers.ts):
// pass base64(message) to the wallet (SEP-53 via the wallets kit, or the demo key for kind "demo")
// and decode the base64 signature (handling the double-encode quirk). ponytail: this leg runs only
// in-browser for a real credential-holding user; not headless.
async function makeStellarSigner(address: string, kind: string | null) {
  const { StrKey } = await import("@stellar/stellar-sdk");
  const hexPublicKey = Buffer.from(StrKey.decodeEd25519PublicKey(address)).toString("hex");
  return {
    publicAddress: hexPublicKey,
    publicKey: hexPublicKey,
    signatureType: "ed25519",
    walletType: "Stellar",
    signMessage: async (msg: Uint8Array | string): Promise<Uint8Array> => {
      const messageBase64 = Buffer.from(msg).toString("base64");
      let signed = Buffer.from(await signMessageWithWallet(messageBase64, address, kind), "base64");
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
      <p className="mt-1 text-left leading-relaxed text-ink-3">
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
    if (!IDOS_ISSUER_AUTH_PUBLIC_KEY) {
      setState({ phase: "error", message: "No trusted issuer configured, so a KYC credential cannot be matched on this deployment yet." });
      return;
    }
    try {
      setState({ phase: "sharing", step: "signing in to idOS" });
      const client = await idle();
      // Wallets without SEP-43 signMessage (Albedo, Rabet, Ledger) reject here with their own message.
      const signer = await makeStellarSigner(address, kind);
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

      // The wallet proves it controls `address` for this exact share (idOS grants identify the
      // owner by user id, not wallet), so the server can bind the allow-list update to it.
      setState({ phase: "sharing", step: "signing the address binding" });
      const signature = await signMessageWithWallet(idosBindingMessage(shared.id), address, kind);

      setState({ phase: "sharing", step: "verifying server-side" });
      const res = await fetch("/api/idos/credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedCredentialId: shared.id, address, signature }),
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
      <p className="leading-relaxed text-ink-2">
        Reads your existing idOS KYC credential to reuse it here. Needs an idOS profile with a
        credential from a trusted issuer; the operator then adds you to the on-chain allow-list.
      </p>

      {(state.phase === "idle" || state.phase === "checking") && (
        <Button variant="subtle" className="mt-2" busy={state.phase === "checking"} onClick={checkProfile} disabled={!address}>
          {state.phase === "checking" ? "Checking idOS profile" : "Check idOS profile"}
        </Button>
      )}
      {!address && state.phase === "idle" && (
        <p className="mt-1 text-ink-3">Connect a wallet first.</p>
      )}

      {state.phase === "no-profile" && (
        <p className="mt-1 leading-relaxed text-ink-2">
          This wallet has no idOS profile. Create one and get a KYC credential from a trusted issuer
          at{" "}
          <a href="https://idos.network" target="_blank" rel="noopener noreferrer" className="underline hover:text-stamp">
            idOS
          </a>
          , then check again.
        </p>
      )}

      {state.phase === "has-profile" && (
        <div className="mt-1">
          <p className="inline-flex items-center gap-1 leading-relaxed text-stamp-deep">
            <Mark kind="check" size={12} /> This wallet owns an idOS profile.
          </p>
          <div className="mt-2">
            <Button variant="subtle" onClick={shareCredential}>
              Reuse my idOS KYC credential
            </Button>
          </div>
        </div>
      )}

      {state.phase === "sharing" && (
        <p className="mt-1 leading-relaxed text-ink-2">Working: {state.step}… Approve the prompts in your wallet and the idOS window.</p>
      )}

      {state.phase === "shared" && !state.verified && (
        <p className="mt-1 leading-relaxed text-ink-2">
          {state.reason || "No trusted idOS KYC credential was found for this wallet."}
        </p>
      )}

      {state.phase === "shared" && state.verified && (
        <div className="mt-1 leading-relaxed">
          <p className="inline-flex items-center gap-1 font-semibold text-stamp-deep">
            <Mark kind="check" size={12} /> idOS KYC credential verified
          </p>
          {state.allowlist?.alreadyListed && (
            <p className="mt-1 text-ink-2">
              This account is already on the ASP allow-list (leaf #{state.allowlist.leafIndex}). It can deposit now.
            </p>
          )}
          {state.allowlist && !state.allowlist.alreadyListed && (
            <div className="mt-1">
              <p className="text-ink-2">
                To enable deposits, the corridor operator applies this on-chain (admin-gated,{" "}
                <code className="text-stamp-deep">set_asp_root</code>). The new root and witness are computed server-side; nothing here is signed.
              </p>
              <div className="mt-2 flex items-start gap-2">
                <pre className="flex-1 overflow-x-auto rounded-tile border border-ink/45 bg-input p-2 font-mono text-[11px] leading-relaxed text-ink-2 shadow-inset">
                  {state.allowlist.setAspRootCli}
                </pre>
                <Button
                  variant="ghost"
                  onClick={() =>
                    navigator.clipboard.writeText(state.allowlist!.setAspRootCli).then(
                      () => toast("set_asp_root CLI copied", "success"),
                      () => toast("Copy failed; select the command and copy it manually", "error"),
                    )
                  }
                >
                  Copy
                </Button>
              </div>
            </div>
          )}
          {address && !state.allowlist && (
            <p className="mt-1 text-ink-3">Credential verified for {shortAddr(address)}. Allow-list update was not computed.</p>
          )}
        </div>
      )}

      {state.phase === "error" && <p className="mt-1 leading-relaxed text-tape-deep">idOS error: {state.message}</p>}

      {/* The idOS enclave iframe mounts here; the SDK controls its visibility. */}
      <div id={IDOS_ENCLAVE_CONTAINER_ID} />
    </div>
  );
}

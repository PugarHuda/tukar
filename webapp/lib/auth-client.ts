"use client";
// Client half of sign-in-with-wallet for the scheduler. Fetches a server nonce, signs it with the
// connected wallet (SEP-53 signMessage through the wallets kit, or the built-in demo key signing
// the same SEP-53 payload so the no-install demo works identically), and exchanges the signature
// for a bearer token. No secret leaves the browser; only a signature over a public nonce goes to
// the server.
import { signMessageWithWallet } from "@/lib/wallet-kit";

/**
 * Sign in with the connected wallet and return a scheduler bearer token.
 * `kind` selects the signer: "demo" (or null) uses the built-in key, anything else the kit wallet.
 * Returns null if the server scheduler is not configured. Throws on a rejected/failed sign-in.
 */
export async function scheduleSignIn(address: string, kind: string | null): Promise<string | null> {
  const nres = await fetch(`/api/schedules/nonce?address=${encodeURIComponent(address)}`);
  const nj = await nres.json();
  if (!nj?.configured) return null;
  if (!nj.nonce) throw new Error("scheduler did not issue a nonce");
  const signature = await signMessageWithWallet(nj.nonce, address, kind);
  const tres = await fetch("/api/schedules/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, nonce: nj.nonce, signature }),
  });
  const tj = await tres.json();
  if (!tj?.token) throw new Error(tj?.error || "sign-in failed");
  return tj.token as string;
}

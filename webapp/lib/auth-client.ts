"use client";
// Client half of sign-in-with-wallet for the scheduler. Fetches a server nonce, signs it with the
// wallet (Freighter's SEP-53 signMessage, or the built-in demo key signing the same SEP-53 payload
// so the no-install demo works identically), and exchanges the signature for a bearer token. No
// secret leaves the browser; only a signature over a public nonce goes to the server.
import { Keypair } from "@stellar/stellar-sdk";
import { DEMO_SECRET } from "@/lib/constants";

const SEP53_PREFIX = "Stellar Signed Message:\n";

// SHA256("Stellar Signed Message:\n" + message) — the exact bytes SEP-53 wallets sign.
async function sep53Hash(message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const prefix = enc.encode(SEP53_PREFIX);
  const msg = enc.encode(message);
  const payload = new Uint8Array(prefix.length + msg.length);
  payload.set(prefix, 0);
  payload.set(msg, prefix.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
}

async function signDemo(nonce: string): Promise<string> {
  const sig = Keypair.fromSecret(DEMO_SECRET).sign(Buffer.from(await sep53Hash(nonce)));
  return Buffer.from(sig).toString("base64");
}

async function signFreighter(nonce: string, address: string): Promise<string> {
  const fa: any = await import("@stellar/freighter-api");
  const f = fa.default ?? fa;
  const res = await f.signMessage(nonce, { address });
  if (res && res.error) throw new Error(String(res.error));
  const sm = res.signedMessage;
  // Freighter v4 returns a base64 string; v3 returns a Buffer/bytes.
  return typeof sm === "string" ? sm : Buffer.from(sm).toString("base64");
}

/**
 * Sign in with the connected wallet and return a scheduler bearer token.
 * `kind` selects the signer: "freighter" uses the extension, anything else uses the demo key.
 * Returns null if the server scheduler is not configured. Throws on a rejected/failed sign-in.
 */
export async function scheduleSignIn(address: string, kind: "freighter" | "demo" | null): Promise<string | null> {
  const nres = await fetch(`/api/schedules/nonce?address=${encodeURIComponent(address)}`);
  const nj = await nres.json();
  if (!nj?.configured) return null;
  if (!nj.nonce) throw new Error("scheduler did not issue a nonce");
  const signature = kind === "freighter" ? await signFreighter(nj.nonce, address) : await signDemo(nj.nonce);
  const tres = await fetch("/api/schedules/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, nonce: nj.nonce, signature }),
  });
  const tj = await tres.json();
  if (!tj?.token) throw new Error(tj?.error || "sign-in failed");
  return tj.token as string;
}

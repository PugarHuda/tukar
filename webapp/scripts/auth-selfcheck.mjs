// Runnable self-check for the scheduler auth scheme (lib/auth.ts). No test framework.
//   node scripts/auth-selfcheck.mjs
// Mirrors the pure HMAC-token + SEP-53 primitives from lib/auth.ts (which imports "server-only"
// and can't be loaded in plain node) and asserts the security properties:
//   1. a valid SEP-53 wallet signature over the nonce verifies; a wrong one is rejected
//   2. an issued token verifies to the SAME owner; a tampered/absent/garbage token is rejected
//   3. owner A's token never resolves to owner B (no cross-owner reads)
//   4. a nonce issued for A cannot mint a token for B
import { createHmac, createHash, timingSafeEqual, randomBytes } from "node:crypto";
import assert from "node:assert";
import { Keypair } from "@stellar/stellar-sdk";

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "self-check-secret-0123456789";

const SEP53_PREFIX = "Stellar Signed Message:\n";
const G_RE = /^G[A-Z2-7]{55}$/;
const secret = () => process.env.AUTH_SECRET;
const b64u = (b) => Buffer.from(b).toString("base64url");
const mac = (domain, p) => createHmac("sha256", secret()).update(domain + "\n" + p).digest("base64url");
const eq = (a, b) => { const ab = Buffer.from(a), bb = Buffer.from(b); return ab.length === bb.length && timingSafeEqual(ab, bb); };
const seal = (domain, obj) => { const p = b64u(Buffer.from(JSON.stringify(obj))); return p + "." + mac(domain, p); };
function open(domain, token) {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const p = token.slice(0, dot), sig = token.slice(dot + 1);
  if (!eq(sig, mac(domain, p))) return null;
  try { return JSON.parse(Buffer.from(p, "base64url").toString("utf8")); } catch { return null; }
}
const issueNonce = (a) => seal("nonce", { a, r: randomBytes(12).toString("hex"), exp: Date.now() + 300000 });
function sep53Hash(msg) {
  return createHash("sha256").update(Buffer.concat([Buffer.from(SEP53_PREFIX, "utf8"), Buffer.from(msg, "utf8")])).digest();
}
function verifyWalletSignature(address, message, sigB64) {
  try { return G_RE.test(address) && Keypair.fromPublicKey(address).verify(sep53Hash(message), Buffer.from(sigB64, "base64")); }
  catch { return false; }
}
function issueToken(address, nonce, sigB64) {
  const n = open("nonce", nonce);
  if (!n || n.a !== address || typeof n.exp !== "number" || n.exp < Date.now()) return null;
  if (!verifyWalletSignature(address, nonce, sigB64)) return null;
  return seal("token", { a: address, exp: Date.now() + 3600000 });
}
function verifyToken(token) {
  const t = open("token", token);
  if (!t || typeof t.a !== "string" || !G_RE.test(t.a) || typeof t.exp !== "number" || t.exp < Date.now()) return null;
  return t.a;
}
// A wallet signs a SEP-53 message the way the demo key / Freighter do.
const signMsg = (kp, msg) => Buffer.from(kp.sign(sep53Hash(msg))).toString("base64");

// ---- fixtures: two independent wallets ----
const A = Keypair.random(), B = Keypair.random();

// 1) SEP-53 signature verification
const nonceA = issueNonce(A.publicKey());
assert.ok(verifyWalletSignature(A.publicKey(), nonceA, signMsg(A, nonceA)), "valid sig must verify");
assert.ok(!verifyWalletSignature(A.publicKey(), nonceA, signMsg(B, nonceA)), "B's sig must not verify as A");

// 2) token issue + verify, and rejection of tampered/absent/garbage tokens
const tokenA = issueToken(A.publicKey(), nonceA, signMsg(A, nonceA));
assert.ok(tokenA && verifyToken(tokenA) === A.publicKey(), "A's token resolves to A");
assert.strictEqual(verifyToken(tokenA.slice(0, -1) + (tokenA.at(-1) === "x" ? "y" : "x")), null, "tampered token rejected");
assert.strictEqual(verifyToken(""), null, "absent token rejected");
assert.strictEqual(verifyToken("not.a.token"), null, "garbage token rejected");

// 3) cross-owner isolation: A's token never resolves to B
assert.notStrictEqual(verifyToken(tokenA), B.publicKey(), "A's token must not read as B");
const nonceB = issueNonce(B.publicKey());
const realTokenB = issueToken(B.publicKey(), nonceB, signMsg(B, nonceB));
assert.ok(realTokenB && verifyToken(realTokenB) === B.publicKey() && verifyToken(realTokenB) !== A.publicKey(), "B's token is B, never A");

// 4) a nonce for A cannot mint a token for B (address must match the nonce + the signature)
assert.strictEqual(issueToken(B.publicKey(), nonceA, signMsg(B, nonceA)), null, "A's nonce cannot mint B's token");
assert.strictEqual(issueToken(A.publicKey(), nonceA, signMsg(B, nonceA)), null, "A's nonce needs A's signature");

console.log("auth-selfcheck: OK (SEP-53 verify, token tamper/absent rejection, cross-owner isolation)");

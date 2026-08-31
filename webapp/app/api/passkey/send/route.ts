import { NextResponse } from "next/server";
import { Address, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { PASSPHRASE, POOL } from "@/lib/constants";
import { WALLET_WASM_HASH, CHANNELS_TESTNET_URL, USDC_SAC } from "@/lib/passkey";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";

// Fee-sponsored submission for passkey smart wallets. The browser signs the auth entries with the
// passkey and sends the built transaction here; the OpenZeppelin Stellar Channels relayer rebuilds
// the envelope around its {func, auth} with a channel account and pays the fee. The relayer key is
// OZ_CHANNELS_API_KEY (server-only, never NEXT_PUBLIC_). Without it the route reports not-configured
// instead of faking a hash.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_XDR_CHARS = 200_000; // a deposit carries two Groth16 proofs; still far below this

// Trust boundary: the sponsor pays for whatever lands here, so only the app's own host functions
// are relayed: a smart-wallet deploy (the exact wallet WASM) or a call into the pool / USDC SAC.
function allowed(built: ReturnType<typeof TransactionBuilder.fromXDR>): string | null {
  if (!("operations" in built) || built.operations.length !== 1) return "expected one operation";
  const op: any = built.operations[0];
  if (op.type !== "invokeHostFunction") return "expected an invokeHostFunction operation";
  const func: xdr.HostFunction = op.func;
  switch (func.switch().name) {
    case "hostFunctionTypeCreateContractV2": {
      const exec = func.createContractV2().executable();
      const ok = exec.switch().name === "contractExecutableWasm" && exec.wasmHash().toString("hex") === WALLET_WASM_HASH;
      return ok ? null : "only the passkey smart-wallet WASM may be deployed here";
    }
    case "hostFunctionTypeInvokeContract": {
      const target = Address.fromScAddress(func.invokeContract().contractAddress()).toString();
      return target === POOL || target === USDC_SAC ? null : "only pool and USDC calls are sponsored";
    }
    default:
      return "unsupported host function";
  }
}

export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "passkey-send", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const apiKey = process.env.OZ_CHANNELS_API_KEY;
  if (!apiKey) return NextResponse.json({ configured: false });

  let body: { xdr?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ configured: true, error: "Invalid request body." }, { status: 400 });
  }
  const txXdr = body?.xdr;
  if (typeof txXdr !== "string" || !txXdr || txXdr.length > MAX_XDR_CHARS) {
    return NextResponse.json({ configured: true, error: "Missing or oversized transaction XDR." }, { status: 400 });
  }
  let reason: string | null;
  try {
    reason = allowed(TransactionBuilder.fromXDR(txXdr, PASSPHRASE));
  } catch {
    reason = "not a valid testnet transaction";
  }
  if (reason) return NextResponse.json({ configured: true, error: `Refused: ${reason}.` }, { status: 400 });

  try {
    const { PasskeyServer } = await import("passkey-kit/server");
    const relayer = new PasskeyServer({ networkPassphrase: PASSPHRASE, relayer: { baseUrl: CHANNELS_TESTNET_URL, apiKey } });
    const result = await relayer.send(txXdr);
    if (result.success) return NextResponse.json({ configured: true, hash: result.hash });
    // The relayer's message carries the on-chain diagnostic (e.g. "Error(Contract, #10)"), which the
    // client maps to the pool's error table. No secret is in it.
    log.warn("passkey relay failed", { route: "passkey/send", reqId: requestId(req), code: result.error.code, err: result.error.message, hash: result.hash });
    return NextResponse.json({ configured: true, error: result.error.message, hash: result.hash ?? null }, { status: 502 });
  } catch (err) {
    log.error("passkey relay threw", { route: "passkey/send", reqId: requestId(req), err: errMsg(err) });
    return NextResponse.json({ configured: true, error: "Relayer submission failed." }, { status: 500 });
  }
}

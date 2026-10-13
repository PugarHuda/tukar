// GET /api/health — liveness + config visibility. Returns 200 whenever the app itself is up; a
// degraded dependency (e.g. the Soroban RPC) is reported in the body, never as a 500. Config checks
// report only WHICH optional integrations are wired (booleans), never any secret value.
import { NextResponse } from "next/server";
import { RPC, NETWORK } from "@/lib/constants";
import { fetchWithTimeout } from "@/lib/net";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { idosConfigured } from "@/lib/idos/consumer.server";
import { isAuthConfigured } from "@/lib/auth";
import { backend as schedulesBackend, STORAGE_ENV_HINT } from "@/lib/schedules";
import { relayerConfigured } from "@/lib/relayer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One cheap, safe liveness probe: Soroban RPC getHealth over the same URL the app already uses.
// Short timeout so a hung RPC cannot hang /api/health; any failure degrades to "unreachable".
async function rpcHealth(): Promise<"ok" | "unreachable"> {
  try {
    const res = await fetchWithTimeout(
      RPC,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      },
      3000,
    );
    if (!res.ok) return "unreachable";
    const json = await res.json();
    return json?.result?.status === "healthy" ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}

// TRISA companion node reachability (its unauthenticated GET /healthz), only when one is wired.
async function trisaHealth(nodeUrl: string): Promise<"ok" | "unreachable"> {
  try {
    const res = await fetchWithTimeout(`${nodeUrl.replace(/\/$/, "")}/healthz`, {}, 2000);
    return res.ok ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export async function GET(req: Request) {
  // Generous, but bounded: each call fans out to the RPC (and the TRISA node when wired).
  const rl = await rateLimit(req, { key: "health", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const trisaUrl = process.env.TRISA_NODE_URL;
  const [rpc, trisaNode] = await Promise.all([rpcHealth(), trisaUrl ? trisaHealth(trisaUrl) : null]);
  const env = process.env;
  const auth = isAuthConfigured();
  const redisEnv = Boolean((env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL) && (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN));
  const store = schedulesBackend();
  const flags = {
    reclaim: Boolean(env.RECLAIM_APP_ID && env.RECLAIM_APP_SECRET && env.RECLAIM_PROVIDER_ID),
    auth,
    // SEP-7 signing needs its own key AND wallet sign-in (app/api/sep7 canSign).
    sep7Signing: Boolean(env.SEP7_SIGNING_SECRET) && auth,
    // Web Push needs both VAPID keys and the Redis watch store (lib/push.ts pushConfigured).
    webPush: Boolean(env.WEB_PUSH_PRIVATE_KEY && env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY) && redisEnv,
    schedulesStore: store !== null,
    schedules: store !== null && auth,
    // Same test the scheduler routes gate on: a private key set, and not the published demo key.
    relayer: relayerConfigured(),
    // false = the CCTP relayer (lib/cctp.ts) signs with the PUBLIC demo key.
    cctpRelayer: Boolean(env.STELLAR_RELAYER_SECRET || env.RELAYER_SECRET),
    trisa: Boolean(trisaUrl),
    notabene: Boolean(env.NOTABENE_API_KEY),
    idos: idosConfigured,
  };
  // The env var NAMES behind each false flag (names only, never values), so a UI can say exactly
  // what is missing instead of "not configured".
  const need: Record<keyof typeof flags, string[]> = {
    reclaim: ["RECLAIM_APP_ID", "RECLAIM_APP_SECRET", "RECLAIM_PROVIDER_ID"],
    auth: ["AUTH_SECRET (16+ chars)"],
    sep7Signing: ["SEP7_SIGNING_SECRET", ...(auth ? [] : ["AUTH_SECRET (16+ chars)"])],
    webPush: ["WEB_PUSH_PRIVATE_KEY", "NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY", ...(redisEnv ? [] : ["KV_REST_API_URL + KV_REST_API_TOKEN"])],
    schedulesStore: [STORAGE_ENV_HINT],
    schedules: [...(store ? [] : [STORAGE_ENV_HINT]), ...(auth ? [] : ["AUTH_SECRET (16+ chars)"])],
    relayer: ["RELAYER_SECRET"],
    cctpRelayer: ["STELLAR_RELAYER_SECRET or RELAYER_SECRET"],
    trisa: ["TRISA_NODE_URL"],
    notabene: ["NOTABENE_API_KEY"],
    idos: ["IDOS_CONSUMER_SIGNER", "IDOS_RECIPIENT_ENC_PRIVATE_KEY"],
  };
  const missing = Object.fromEntries(
    (Object.keys(flags) as (keyof typeof flags)[]).filter((k) => !flags[k]).map((k) => [k, need[k]]),
  );
  return NextResponse.json({
    status: "ok",
    time: new Date().toISOString(),
    // Which Stellar network this deployment is pointed at. Always "testnet" today; the app refuses
    // to start on any other target (lib/constants.ts resolveNetwork), so this can never read
    // "mainnet" while the mainnet deployment record is empty.
    network: NETWORK,
    checks: {
      rpc,
      // Presence-only booleans for the optional integrations. Never the values.
      ...flags,
      ...(trisaNode ? { trisaNode } : {}),
    },
    missing,
  });
}

// GET /api/health — liveness + config visibility. Returns 200 whenever the app itself is up; a
// degraded dependency (e.g. the Soroban RPC) is reported in the body, never as a 500. Config checks
// report only WHICH optional integrations are wired (booleans), never any secret value.
import { NextResponse } from "next/server";
import { RPC } from "@/lib/constants";
import { fetchWithTimeout } from "@/lib/net";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { idosConfigured } from "@/lib/idos/consumer.server";

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
  return NextResponse.json({
    status: "ok",
    time: new Date().toISOString(),
    checks: {
      rpc,
      // Presence-only booleans for the optional integrations. Never the values.
      reclaim: Boolean(process.env.RECLAIM_APP_ID && process.env.RECLAIM_APP_SECRET && process.env.RECLAIM_PROVIDER_ID),
      schedules: Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.AUTH_SECRET),
      trisa: Boolean(trisaUrl),
      ...(trisaNode ? { trisaNode } : {}),
      notabene: Boolean(process.env.NOTABENE_API_KEY),
      idos: idosConfigured,
    },
  });
}

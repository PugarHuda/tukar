// GET /api/health — liveness + config visibility. Returns 200 whenever the app itself is up; a
// degraded dependency (e.g. the Soroban RPC) is reported in the body, never as a 500. Config checks
// report only WHICH optional integrations are wired (booleans), never any secret value.
import { NextResponse } from "next/server";
import { RPC } from "@/lib/constants";
import { fetchWithTimeout } from "@/lib/net";

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

export async function GET() {
  const rpc = await rpcHealth();
  return NextResponse.json({
    status: "ok",
    time: new Date().toISOString(),
    checks: {
      rpc,
      // Presence-only booleans for the optional integrations. Never the values.
      reclaim: Boolean(process.env.RECLAIM_APP_ID && process.env.RECLAIM_APP_SECRET && process.env.RECLAIM_PROVIDER_ID),
      schedules: Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.AUTH_SECRET),
      trisa: Boolean(process.env.TRISA_NODE_URL),
      notabene: Boolean(process.env.NOTABENE_API_KEY),
    },
  });
}

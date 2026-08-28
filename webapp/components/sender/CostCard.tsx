"use client";

// Pre-flight cost and policy card for the Sender form: what this send costs on the network, where
// the FX figure comes from, what the on-chain policy registry says about the corridor, and what
// mainstream providers deliver for the same USD amount (public Wise comparison data, proxied by
// /api/benchmark). Plain numbers, each labelled with its source.
import { useEffect, useState } from "react";
import { readCorridorPolicy, OBSERVED_SEND_FEE_STROOPS } from "@/lib/stellar";
import { corridorByCode, fmtLocal } from "@/components/receiver/corridors";
import type { BenchmarkProvider } from "@/lib/benchmark";

type Policy = Awaited<ReturnType<typeof readCorridorPolicy>>;
type Bench = { state: "loading" } | { state: "ok"; best: BenchmarkProvider; count: number } | { state: "none"; reason: string } | { state: "unavailable" };

// Registry disclosure enum -> name (index = the u32 the contract stores), same map as the operator console.
const DISCLOSURE = ["exact", "threshold", "range", "aggregate"];
const SEND_FEE_XLM = ((OBSERVED_SEND_FEE_STROOPS.deposit + OBSERVED_SEND_FEE_STROOPS.register) / 1e7).toFixed(4);
const BENCH_MAX_USD = 1_000_000; // the route's upper bound

export function CostCard({ code, usdc, receive, fxSource, className = "" }: { code: string; usdc: number; receive: number; fxSource?: "reflector" | "fx-api"; className?: string }) {
  const cor = corridorByCode(code);
  const [policy, setPolicy] = useState<Policy | undefined>(undefined); // undefined = reading
  const [bench, setBench] = useState<Bench>({ state: "loading" });

  useEffect(() => {
    let alive = true;
    setPolicy(undefined);
    readCorridorPolicy(code).then((p) => {
      if (alive) setPolicy(p);
    });
    return () => {
      alive = false;
    };
  }, [code]);

  const benchable = Number.isFinite(usdc) && usdc > 0 && usdc <= BENCH_MAX_USD;
  useEffect(() => {
    if (!benchable) return;
    let alive = true;
    setBench({ state: "loading" });
    // Debounce typing so a keystroke burst is one request, and the rate limit is never our own doing.
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/benchmark?fiat=${cor.currency}&amount=${usdc}`);
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setBench({ state: "unavailable" });
        else if (!Array.isArray(j.providers) || !j.providers.length) setBench({ state: "none", reason: j.reason || `no benchmark for ${cor.currency}` });
        else setBench({ state: "ok", best: j.providers[0], count: j.providers.length });
      } catch {
        if (alive) setBench({ state: "unavailable" });
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [cor.currency, usdc, benchable]);

  const fxText =
    fxSource === "reflector"
      ? "Reflector on-chain oracle (SEP-40). Settlement prices at the median of 5 records."
      : cor.oracle
        ? `HTTP FX fallback. Reflector's ${cor.currency} feed is stale or unreadable right now.`
        : fxSource === "fx-api"
          ? `HTTP FX fallback. Reflector carries no ${cor.currency} feed.`
          : "Static preview rate. The live FX rate has not loaded yet.";

  let policyText: string;
  if (policy === undefined) policyText = "Reading the policy registry.";
  else if (policy === null) policyText = "Policy registry unreadable right now.";
  else if (!policy.policy) policyText = `No policy set for ${cor.code} in the on-chain registry.`;
  else {
    const p = policy.policy;
    policyText = `Cap $${p.capUsdc.toLocaleString("en-US")} USDC, required disclosure: ${DISCLOSURE[p.disclosure] ?? `mode ${p.disclosure}`}.`;
    if (usdc > p.capUsdc) policyText += " This amount is above the cap. The cap is enforced on the preview pool, not yet on the live pool.";
  }

  const diff = bench.state === "ok" ? receive - bench.best.receivedAmount : 0;

  return (
    <div className={`rounded-tile border border-line bg-black/20 p-3.5 ${className}`}>
      <div className="font-mono text-[10px] tracking-[0.12em] text-tf uppercase">Cost and policy</div>
      <Row k="Network fee">
        About {SEND_FEE_XLM} XLM. Deposit plus tree registration as charged on testnet (2026-08-26). The exact fee is set by simulation when you sign.
      </Row>
      <Row k="Relayer fee">0. There is no relayer today; you sign and pay the network fee yourself.</Row>
      <Row k="FX source">{fxText}</Row>
      <Row k="Corridor policy">{policyText}</Row>
      <Row k="Market benchmark" last>
        {!benchable ? (
          `Benchmark needs an amount between 0 and ${BENCH_MAX_USD.toLocaleString("en-US")} USD.`
        ) : bench.state === "loading" ? (
          "Fetching provider quotes."
        ) : bench.state === "unavailable" ? (
          "Benchmark unavailable."
        ) : bench.state === "none" ? (
          bench.reason
        ) : (
          <>
            Best of {bench.count} providers: {bench.best.name} delivers {cor.symbol}
            {fmtLocal(bench.best.receivedAmount)} {cor.currency} after a ${bench.best.fee.toFixed(2)} fee
            {bench.best.deliveryHours != null ? `, about ${bench.best.deliveryHours}h` : ""}. Tukar quote: {cor.symbol}
            {fmtLocal(receive)} {cor.currency} ({diff >= 0 ? "+" : "-"}
            {fmtLocal(Math.abs(diff))} vs {bench.best.name}), before the cash-out provider&apos;s fee.
          </>
        )}
      </Row>
    </div>
  );
}

function Row({ k, children, last }: { k: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`py-2 ${last ? "" : "border-b border-line"}`}>
      <div className="font-mono text-[10px] tracking-[0.04em] text-tf uppercase">{k}</div>
      <div className="mt-0.5 text-[12.5px] leading-relaxed text-ts">{children}</div>
    </div>
  );
}

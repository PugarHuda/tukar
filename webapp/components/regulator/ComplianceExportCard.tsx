"use client";

// Regulator: compliance export pack. Reads every pool event the RPC still retains, joins the
// disclosures and audit requests this console produced, and downloads a CSV / JSON under a
// jurisdiction preset. Identity fields Tukar does not hold are exported as "anchor-held".
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Spinner, useToast } from "@/components/ui";
import {
  PRESETS,
  buildReport,
  toCsv,
  toJson,
  readPoolEvents,
  fetchPhpRate,
  RPC_RETENTION_NOTE,
  type PresetId,
  type PoolEventWindow,
  type PhpRate,
  type DisclosureRecord,
  type AuditRequestRecord,
  type PolicySnapshot,
} from "@/lib/compliance-export";

const inputCls =
  "mt-[7px] w-full rounded-[11px] border border-line-input bg-input px-3.5 py-3 font-mono text-sm text-tp transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)]";
const labelCls = "block font-mono text-[10px] tracking-[0.12em] text-tf uppercase";

const day = (iso: string) => iso.slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

export function ComplianceExportCard({ disclosures, auditRequests, policy }: { disclosures: DisclosureRecord[]; auditRequests: AuditRequestRecord[]; policy: PolicySnapshot }) {
  const { toast } = useToast();
  const [preset, setPreset] = useState<PresetId>("ppatk-ltkl");
  const [win, setWin] = useState<PoolEventWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(today());
  const [fx, setFx] = useState<PhpRate | null | undefined>(undefined); // undefined = not fetched yet

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const w = await readPoolEvents();
      setWin(w);
      setFrom(w.events.length ? day(w.events[0].closedAt) : today());
      setTo(today());
    } catch (e: any) {
      setWin(null);
      setErr("Could not read pool events from the RPC: " + ((e && e.message) || String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (preset === "bsp-php-50k" && fx === undefined) fetchPhpRate().then(setFx);
  }, [preset, fx]);

  const minDate = win && win.events.length ? day(win.events[0].closedAt) : undefined;
  const report = useMemo(() => {
    if (!win || !from || !to) return null;
    return buildReport({ preset, events: win.events, rpc: { oldestLedger: win.oldestLedger, latestLedger: win.latestLedger }, disclosures, auditRequests, policy, window: { from, to }, fx: fx ?? null });
  }, [win, from, to, preset, disclosures, auditRequests, policy, fx]);

  const download = (kind: "csv" | "json") => {
    if (!report) return;
    const text = kind === "csv" ? toCsv(report) : toJson(report);
    const url = URL.createObjectURL(new Blob([text], { type: kind === "csv" ? "text/csv" : "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tukar-compliance-${preset}-${from}-to-${to}.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${kind.toUpperCase()} downloaded`, "success");
  };

  const chosen = PRESETS.find((p) => p.id === preset) || PRESETS[0];
  const h = report?.header;

  return (
    <section className="rounded-card border border-line bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="tk-eyebrow text-lg font-extrabold tracking-[-0.01em]">Compliance export pack</h2>
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-tm">
            Every pool event the RPC still retains, plus the disclosures verified and the audit requests registered in this session,
            shaped for a reporting preset. Tukar holds no personal data: identity fields are exported as the literal
            &quot;anchor-held&quot; and the header block says so. {RPC_RETENTION_NOTE}
          </p>
        </div>
        <Button variant="subtle" busy={loading} onClick={load}>
          Refresh events
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="ce-preset" className={labelCls}>
            Preset
          </label>
          <select id="ce-preset" value={preset} onChange={(e) => setPreset(e.target.value as PresetId)} className={inputCls}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ce-from" className={labelCls}>
            From (UTC date)
          </label>
          <input id="ce-from" type="date" value={from} min={minDate} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="ce-to" className={labelCls}>
            To (UTC date)
          </label>
          <input id="ce-to" type="date" value={to} min={from || minDate} max={today()} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
      </div>
      <p className="mt-2 text-[12px] text-tm">
        {chosen.regulation}.{" "}
        <a href={chosen.reference} target="_blank" rel="noreferrer" className="text-orange-l3 underline underline-offset-2 hover:text-orange">
          Reference ↗
        </a>
      </p>

      {loading && (
        <div className="mt-4">
          <Spinner label="reading pool events from Stellar RPC…" />
        </div>
      )}
      {err && (
        <div className="mt-4 flex items-center gap-3 text-[13px] text-amber">
          {err}
          <Button variant="subtle" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {report && h && (
        <div className="mt-4 rounded-tile border border-line bg-black/20 p-4 text-[13px]">
          <div className="text-ts">
            <b>{String(h["counts.poolEvents"])}</b> pool event(s) · <b>{String(h["counts.disclosures"])}</b> disclosure(s) ·{" "}
            <b>{String(h["counts.auditRequests"])}</b> audit request(s) in the selected window.
          </div>
          <div className="mt-1.5 text-tm">
            {h["dataWindow.fromLedger"] != null ? (
              <>
                Events from ledger {String(h["dataWindow.fromLedger"])} ({String(h["dataWindow.fromLedgerTime"])}) to ledger {String(h["dataWindow.toLedger"])} (
                {String(h["dataWindow.toLedgerTime"])}).
              </>
            ) : (
              <>No pool events in the selected window.</>
            )}{" "}
            RPC retains ledgers {String(h["dataWindow.rpcOldestLedger"])} to {String(h["dataWindow.rpcLatestLedger"])}.
          </div>
          {preset === "bsp-php-50k" && (
            <div className="mt-1.5 text-tm">
              {fx === undefined
                ? "Fetching the USD to PHP rate…"
                : fx
                  ? `PHP threshold test at ${fx.phpPerUsd} PHP per USD (${fx.source}, ${fx.fetchedAt}).`
                  : "USD to PHP rate unavailable; the threshold column says so for every row."}
            </div>
          )}
          <div className="mt-2 font-mono text-[11px] text-tf">Columns: {report.columns.map((c) => c.label).join(" · ")}</div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={() => download("csv")} disabled={!report.rows.length} title={!report.rows.length ? "Nothing in the selected window" : undefined}>
              Download CSV
            </Button>
            <Button variant="subtle" onClick={() => download("json")} disabled={!report.rows.length} title={!report.rows.length ? "Nothing in the selected window" : undefined}>
              Download JSON
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

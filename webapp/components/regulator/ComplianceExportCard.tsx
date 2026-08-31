"use client";

// Regulator: compliance export pack. Reads every pool event the RPC still retains, joins the
// disclosures and audit requests this console produced, and downloads a CSV / JSON under a
// jurisdiction preset. Identity fields Tukar does not hold are exported as "anchor-held". On the
// desk it is a bundle under a tape band, the chosen preset stamped on its header.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Select, Spinner, useToast } from "@/components/ui";
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
import { Sheet, Stamp, Field, Out } from "./desk";

const day = (iso: string) => iso.slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

export function ComplianceExportCard({ disclosures, auditRequests, policy }: { disclosures: DisclosureRecord[]; auditRequests: AuditRequestRecord[]; policy: PolicySnapshot }) {
  const { toast } = useToast();
  const [preset, setPreset] = useState<PresetId>("ppatk-ltkl");
  const [win, setWin] = useState<PoolEventWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [from, setFrom] = useState("");
  // Starts empty and is filled after mount: a date computed during render is baked into the
  // prerendered input value and never corrected on hydration (stale across midnight UTC).
  const [to, setTo] = useState("");
  const [fx, setFx] = useState<PhpRate | null | undefined>(undefined); // undefined = not fetched yet

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const w = await readPoolEvents();
      setWin(w);
      // Keep a hand-picked range across a refresh; only fill the fields that are still empty.
      setFrom((cur) => cur || (w.events.length ? day(w.events[0].closedAt) : today()));
      setTo((cur) => cur || today());
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
    <Sheet
      tape
      title="Compliance export pack"
      meta={`Bundle · ${chosen.jurisdiction}`}
      sub={
        <>
          Every pool event the RPC still retains, plus the disclosures verified and the audit requests registered in this session,
          shaped for a reporting preset. Tukar holds no personal data: identity fields are exported as the literal &quot;anchor-held&quot;
          and the header block says so. {RPC_RETENTION_NOTE}
        </>
      }
      right={
        <Button variant="subtle" busy={loading} onClick={load}>
          Refresh events
        </Button>
      }
    >
      {/* The preset is the bundle's stamped header; the form fields choose it and the window. */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-t-2 border-ink pt-4">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <Select id="ce-preset" label="Preset" value={preset} onChange={(e) => setPreset(e.target.value as PresetId)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
          <Input id="ce-from" label="From (UTC date)" type="date" value={from} min={minDate} max={to} onChange={(e) => setFrom(e.target.value)} className="font-mono" />
          <Input id="ce-to" label="To (UTC date)" type="date" value={to} min={from || minDate} max={today()} onChange={(e) => setTo(e.target.value)} className="font-mono" />
        </div>
        <Stamp size="lg" className="mb-1">
          {chosen.label}
        </Stamp>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
        {chosen.regulation}. <Out href={chosen.reference}>Reference</Out>
      </p>

      {loading && (
        <div className="mt-4">
          <Spinner label="reading pool events from Stellar RPC…" />
        </div>
      )}
      {err && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-tape-deep">
          {err}
          <Button variant="subtle" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {report && h && (
        <div className="mt-5 border-t border-ink/25 pt-2 text-[13px]">
          <dl className="grid grid-cols-3 gap-x-6">
            <Field k="Pool events" v={String(h["counts.poolEvents"])} />
            <Field k="Disclosures" v={String(h["counts.disclosures"])} />
            <Field k="Audit requests" v={String(h["counts.auditRequests"])} />
          </dl>
          <div className="mt-3 text-ink-3">
            {h["dataWindow.fromLedger"] != null ? (
              <>
                Events from ledger <span className="font-mono text-ink">{String(h["dataWindow.fromLedger"])}</span> ({String(h["dataWindow.fromLedgerTime"])}) to ledger{" "}
                <span className="font-mono text-ink">{String(h["dataWindow.toLedger"])}</span> ({String(h["dataWindow.toLedgerTime"])}).
              </>
            ) : (
              <>No pool events in the selected window.</>
            )}{" "}
            RPC retains ledgers <span className="font-mono">{String(h["dataWindow.rpcOldestLedger"])}</span> to{" "}
            <span className="font-mono">{String(h["dataWindow.rpcLatestLedger"])}</span>.
          </div>
          {preset === "bsp-php-50k" && (
            <div className="mt-1.5 text-ink-3">
              {fx === undefined
                ? "Fetching the USD to PHP rate…"
                : fx
                  ? `PHP threshold test at ${fx.phpPerUsd} PHP per USD (${fx.source}, ${fx.fetchedAt}).`
                  : "USD to PHP rate unavailable; the threshold column says so for every row."}
            </div>
          )}
          <div className="mt-2 font-mono text-[11px] leading-relaxed text-ink-3">Columns: {report.columns.map((c) => c.label).join(" · ")}</div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => download("csv")} disabled={!report.rows.length} title={!report.rows.length ? "Nothing in the selected window" : undefined}>
              Download CSV
            </Button>
            <Button variant="subtle" onClick={() => download("json")} disabled={!report.rows.length} title={!report.rows.length ? "Nothing in the selected window" : undefined}>
              Download JSON
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

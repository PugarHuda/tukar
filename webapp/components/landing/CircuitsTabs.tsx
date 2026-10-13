"use client";

import { useEffect, useState } from "react";
import { LIVE_CONTRACTS, contractExplorer, type ContractStatus } from "@/lib/live-contracts";

// CIRCUITS / CONTRACTS / CORRIDOR FLOW / DISCLOSURE tabs. Each tab is a page of the manifest: one
// ruled row per item, its status as a stamp at the row's end. Rows backed by a contract stamp the live
// on-ledger check from /api/contracts/status (with the ledger it was read at), not a static claim.
type TabKey = "circuits" | "contracts" | "flow" | "disclosure";
// `cid` = the live contract behind the row: its id links to stellar.expert and its stamp is the
// live on-ledger check from /api/contracts/status, not a static claim.
type Row = { tag: string; code: string; name: string; type: string; status: string; meta: string; icon: keyof typeof ICONS; cid?: string };
const L = LIVE_CONTRACTS;

const DATA: Record<TabKey, Row[]> = {
  circuits: [
    { tag: "Groth16 · BN254", code: "transfer.circom", name: "Shielded transfer", type: "2-in / 2-out JoinSplit", status: "", meta: "depth 10", icon: "swap", cid: L.transfer },
    { tag: "Groth16 · BN254", code: "compliance.circom", name: "ASP compliance", type: "allow ∈ / deny ∉", status: "", meta: "bound", icon: "shield", cid: L.compliance },
    { tag: "Groth16 · BN254", code: "disclosure.circom", name: "Selective disclosure", type: "commitment → amount", status: "", meta: "tamper → reject", icon: "eye", cid: L.disclosure },
    { tag: "Groth16 · BN254", code: "merkleUpdate.circom", name: "Trustless update", type: "old_root → new_root", status: "", meta: "fake → reject", icon: "tree", cid: L.merkleUpdate },
    { tag: "Groth16 · BN254", code: "thresholdDisclosure.circom", name: "Threshold disclosure", type: "amount ≤ figure, hidden", status: "", meta: "amount hidden", icon: "eye", cid: L.threshold },
    { tag: "Groth16 · BN254", code: "aggregateDisclosure.circom", name: "Aggregate disclosure", type: "Σ portfolio ≤ cap", status: "", meta: "audit-bound", icon: "layers", cid: L.aggregate },
    { tag: "Groth16 · BN254", code: "rangeDisclosure.circom", name: "Range disclosure", type: "lower ≤ amount ≤ upper", status: "", meta: "amount hidden", icon: "eye", cid: L.range },
  ],
  contracts: [
    { tag: "Soroban", code: "", name: "pool", type: "orchestration · nullifiers", status: "", meta: "no double-spend", icon: "layers", cid: L.pool },
    { tag: "Soroban", code: "", name: "transfer verifier", type: "shielded JoinSplit", status: "", meta: "BN254", icon: "chip", cid: L.transfer },
    { tag: "Soroban", code: "", name: "compliance verifier", type: "ASP allow / deny", status: "", meta: "BN254", icon: "shield", cid: L.compliance },
    { tag: "Soroban", code: "", name: "disclosure verifier", type: "selective disclosure", status: "", meta: "tamper → reject", icon: "eye", cid: L.disclosure },
    { tag: "Soroban", code: "", name: "merkleUpdate verifier", type: "trustless root advance", status: "", meta: "fake → reject", icon: "tree", cid: L.merkleUpdate },
    { tag: "Soroban", code: "", name: "threshold verifier", type: "amount ≤ figure, hidden", status: "", meta: "amount hidden", icon: "eye", cid: L.threshold },
    { tag: "Soroban", code: "", name: "aggregate verifier", type: "Σ portfolio ≤ cap", status: "", meta: "audit-bound", icon: "layers", cid: L.aggregate },
    { tag: "Soroban", code: "", name: "range verifier", type: "lower ≤ amount ≤ upper", status: "", meta: "amount hidden", icon: "eye", cid: L.range },
  ],
  flow: [
    { tag: "Edge A", code: "fiat → USDC", name: "Deposit", type: "compliance proof bound", status: "On-chain", meta: "pinned ASP", icon: "in" },
    { tag: "Corridor", code: "shielded", name: "Transfer", type: "spend · record", status: "Private", meta: "hidden", icon: "swap" },
    { tag: "Tree", code: "register_root", name: "Update", type: "merkleUpdate proof", status: "Trustless", meta: "enforced", icon: "refresh" },
    { tag: "Edge B", code: "USDC → fiat", name: "Withdraw", type: "amount bound to proof", status: "On-chain", meta: "AmountNotBound", icon: "out" },
  ],
  disclosure: [
    { tag: "Regulator", code: "audit request", name: "Open commitment", type: "opens to one amount", status: "Proven", meta: "bound", icon: "eye" },
    { tag: "Off-chain", code: "false witness", name: "Soundness", type: "false witness rejected", status: "Rejected", meta: "neg test", icon: "shield" },
    { tag: "On-chain", code: "tampered input", name: "Tamper check", type: "tampered public input", status: "InvalidProof", meta: "on-chain", icon: "alert" },
    { tag: "Privacy", code: "pool", name: "No graph leak", type: "payment graph hidden", status: "Private", meta: "selective", icon: "lock" },
  ],
};

const ICONS = {
  swap: ["M4 8H18", "M15 5 18 8 15 11", "M20 16H6", "M9 13 6 16 9 19"],
  shield: ["M12 3 19 6V11C19 16 16 19 12 21 8 19 5 16 5 11V6Z", "M9 12 11 14 15 9"],
  eye: ["M2 12C5 6 19 6 22 12 19 18 5 18 2 12Z", "M12 9.4A2.6 2.6 0 1 0 12.01 9.4"],
  tree: ["M12 5 6 11", "M12 5 18 11", "M6 11 3 18", "M6 11 9 18", "M18 11 15 18", "M18 11 21 18", "M12 3.4A1 1 0 1 0 12.01 3.4"],
  layers: ["M12 3 21 8 12 13 3 8Z", "M3 12 12 17 21 12", "M3 16 12 21 21 16"],
  chip: ["M7 7H17V17H7Z", "M10 10H14V14H10Z", "M9 3V6", "M15 3V6", "M9 18V21", "M15 18V21", "M3 9H6", "M3 15H6", "M18 9H21", "M18 15H21"],
  in: ["M16 4H20V20H16", "M4 12H14", "M11 9 14 12 11 15"],
  out: ["M8 4H4V20H8", "M20 12H10", "M13 9 10 12 13 15"],
  refresh: ["M20 11A8 8 0 0 0 6 6L4 8", "M4 4V8H8", "M4 13A8 8 0 0 0 18 18L20 16", "M20 20V16H16"],
  lock: ["M6 11H18V20H6Z", "M8.5 11V8A3.5 3.5 0 0 1 15.5 8V11", "M12 14V17"],
  alert: ["M12 3 22 20H2Z", "M12 9V14", "M12 17V17.4"],
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "circuits", label: "Circuits" },
  { key: "contracts", label: "Contracts" },
  { key: "flow", label: "Corridor flow" },
  { key: "disclosure", label: "Disclosure" },
];

// Statuses that mean "rejected" are stamped in tape red; everything else in stamp blue.
const RED = /reject|invalid/i;

function IconSVG({ name }: { name: keyof typeof ICONS }) {
  const paths = ICONS[name] || ICONS.swap;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

// The stamp for a row backed by a live contract: what the on-ledger check found, and at which ledger.
function liveStamp(cid: string, st: ContractStatus | null | undefined): { text: string; red: boolean } {
  if (st === undefined) return { text: "checking…", red: false };
  const s = st?.contracts[cid];
  if (s === "live") return { text: `live · ledger ${st!.ledger}`, red: false };
  if (s === "missing") return { text: `not found · ledger ${st!.ledger}`, red: true };
  return { text: "unreachable", red: true };
}

function CircRow({ c, st }: { c: Row; st: ContractStatus | null | undefined }) {
  const stamp = c.cid ? liveStamp(c.cid, st) : { text: c.status, red: RED.test(c.status) };
  return (
    <li className="circ-row">
      <span className="circ-icon">
        <IconSVG name={c.icon} />
      </span>
      <span className="circ-main">
        <span className="circ-name">{c.name}</span>
        <span className="circ-type">{c.type}</span>
        <span className="circ-code">
          {c.code && <>{c.code} · </>}
          {c.cid && (
            <>
              <a href={contractExplorer(c.cid)} target="_blank" rel="noopener" title={c.cid}>
                {c.cid.slice(0, 7)}…{c.cid.slice(-8)}
              </a>{" "}
              ·{" "}
            </>
          )}
          {c.tag} · {c.meta}
        </span>
      </span>
      <span className={"tk-stamp stamp-xs circ-stamp" + (stamp.red ? " tk-stamp-red" : "")} title={c.cid && st ? `checked ${st.checkedAt}` : undefined}>
        {stamp.text}
      </span>
    </li>
  );
}

export function CircuitsTabs() {
  const [active, setActive] = useState<TabKey>("circuits");
  // undefined = checking, null = the status route itself failed (every contract stamp reads unreachable).
  const [status, setStatus] = useState<ContractStatus | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/contracts/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus, () => setStatus(null));
  }, []);

  // The header "Contracts" nav points at #contracts (the tablist). Reading the hash lets that
  // click actually show the Contracts tab, not just scroll to the still-Circuits-active tablist.
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === "#contracts") setActive("contracts");
      else if (window.location.hash === "#circuits") setActive("circuits");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <div className="manifest">
      <div id="contracts" className="tabs" role="tablist" aria-label="Corridor layers">
        {TABS.map((t) => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            className="tab"
            role="tab"
            aria-selected={active === t.key}
            aria-controls="circ-panel"
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="circ-panel" role="tabpanel" aria-labelledby={`tab-${active}`}>
        <ul className="circ-rows">
          {DATA[active].map((c, i) => (
            <CircRow key={i} c={c} st={status} />
          ))}
        </ul>
      </div>
    </div>
  );
}

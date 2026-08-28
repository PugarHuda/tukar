"use client";

import { useEffect, useState } from "react";

// CIRCUITS / CONTRACTS / CORRIDOR FLOW / DISCLOSURE tabs. Each tab is a page of the manifest: one
// ruled row per item, its status as a stamp at the row's end. Data ported from frontend/landing.js.
type TabKey = "circuits" | "contracts" | "flow" | "disclosure";
type Row = { tag: string; code: string; name: string; type: string; status: string; meta: string; icon: keyof typeof ICONS };

const DATA: Record<TabKey, Row[]> = {
  circuits: [
    { tag: "Groth16 · BN254", code: "transfer.circom", name: "Shielded transfer", type: "2-in / 2-out JoinSplit", status: "Verified on-chain", meta: "depth 10", icon: "swap" },
    { tag: "Groth16 · BN254", code: "compliance.circom", name: "ASP compliance", type: "allow ∈ / deny ∉", status: "Verified on-chain", meta: "bound", icon: "shield" },
    { tag: "Groth16 · BN254", code: "disclosure.circom", name: "Selective disclosure", type: "commitment → amount", status: "Verified on-chain", meta: "tamper → reject", icon: "eye" },
    { tag: "Groth16 · BN254", code: "merkleUpdate.circom", name: "Trustless update", type: "old_root → new_root", status: "Verified on-chain", meta: "fake → reject", icon: "tree" },
    { tag: "Groth16 · BN254", code: "thresholdDisclosure.circom", name: "Threshold disclosure", type: "amount ≤ figure, hidden", status: "Verified on-chain", meta: "amount hidden", icon: "eye" },
    { tag: "Groth16 · BN254", code: "aggregateDisclosure.circom", name: "Aggregate disclosure", type: "Σ portfolio ≤ cap", status: "Verified on-chain", meta: "audit-bound", icon: "layers" },
    { tag: "Groth16 · BN254", code: "rangeDisclosure.circom", name: "Range disclosure", type: "lower ≤ amount ≤ upper", status: "Verified on-chain", meta: "amount hidden", icon: "eye" },
  ],
  contracts: [
    { tag: "Soroban", code: "CBIYQAC…DK2MHTWJ", name: "pool", type: "orchestration · nullifiers", status: "52/52 tests pass", meta: "no double-spend", icon: "layers" },
    { tag: "Soroban", code: "CACHZSW…3PUNE", name: "transfer verifier", type: "shielded JoinSplit", status: "verify → true", meta: "BN254", icon: "chip" },
    { tag: "Soroban", code: "CDXYGM3…XBCG2", name: "compliance verifier", type: "ASP allow / deny", status: "verify → true", meta: "tx ✓", icon: "shield" },
    { tag: "Soroban", code: "CAYGURQ…J4W4V", name: "disclosure verifier", type: "selective disclosure", status: "verify → true", meta: "tamper → reject", icon: "eye" },
    { tag: "Soroban", code: "CCA3T54…S3X6H", name: "merkleUpdate verifier", type: "trustless root advance", status: "verify → true", meta: "fake → reject", icon: "tree" },
    { tag: "Soroban", code: "CDGOSIZ…KLHVR", name: "threshold verifier", type: "amount ≤ figure, hidden", status: "verify → true", meta: "amount hidden", icon: "eye" },
    { tag: "Soroban", code: "CCTN437…AZJYA", name: "aggregate verifier", type: "Σ portfolio ≤ cap", status: "verify → true", meta: "audit-bound", icon: "layers" },
    { tag: "Soroban", code: "CDUONEV…NUPQW", name: "range verifier", type: "lower ≤ amount ≤ upper", status: "verify → true", meta: "amount hidden", icon: "eye" },
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

function CircRow({ c }: { c: Row }) {
  return (
    <li className="circ-row">
      <span className="circ-icon">
        <IconSVG name={c.icon} />
      </span>
      <span className="circ-main">
        <span className="circ-name">{c.name}</span>
        <span className="circ-type">{c.type}</span>
        <span className="circ-code">
          {c.code} · {c.tag} · {c.meta}
        </span>
      </span>
      <span className={"tk-stamp stamp-xs circ-stamp" + (RED.test(c.status) ? " tk-stamp-red" : "")}>{c.status}</span>
    </li>
  );
}

export function CircuitsTabs() {
  const [active, setActive] = useState<TabKey>("circuits");

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
            <CircRow key={i} c={c} />
          ))}
        </ul>
      </div>
    </div>
  );
}

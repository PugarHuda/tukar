"use client";

import { useState } from "react";

// CIRCUITS / CONTRACTS / CORRIDOR FLOW / DISCLOSURE tabs.
// Faithful port of initTabs() + DATA + ICONS from frontend/landing.js.
type TabKey = "circuits" | "contracts" | "flow" | "disclosure";
type Card = { tag: string; code: string; name: string; type: string; status: string; meta: string; icon: keyof typeof ICONS };

const DATA: Record<TabKey, Card[]> = {
  circuits: [
    { tag: "GROTH16 · BN254", code: "transfer.circom", name: "Shielded transfer", type: "2-in / 2-out JoinSplit", status: "VERIFIED ON-CHAIN", meta: "depth 10", icon: "swap" },
    { tag: "GROTH16 · BN254", code: "compliance.circom", name: "ASP compliance", type: "allow ∈ / deny ∉", status: "VERIFIED ON-CHAIN", meta: "bound", icon: "shield" },
    { tag: "GROTH16 · BN254", code: "disclosure.circom", name: "Selective disclosure", type: "commitment → amount", status: "VERIFIED ON-CHAIN", meta: "tamper → reject", icon: "eye" },
    { tag: "GROTH16 · BN254", code: "merkleUpdate.circom", name: "Trustless update", type: "old_root → new_root", status: "VERIFIED ON-CHAIN", meta: "fake → reject", icon: "tree" },
    { tag: "GROTH16 · BN254", code: "thresholdDisclosure.circom", name: "Threshold disclosure", type: "amount ≤ figure, hidden", status: "VERIFIED ON-CHAIN", meta: "amount hidden", icon: "eye" },
    { tag: "GROTH16 · BN254", code: "aggregateDisclosure.circom", name: "Aggregate disclosure", type: "Σ portfolio ≤ cap", status: "VERIFIED ON-CHAIN", meta: "audit-bound", icon: "layers" },
    { tag: "GROTH16 · BN254", code: "rangeDisclosure.circom", name: "Range disclosure", type: "lower ≤ amount ≤ upper", status: "VERIFIED ON-CHAIN", meta: "amount hidden", icon: "eye" },
  ],
  contracts: [
    { tag: "SOROBAN", code: "CBIYQAC…DK2MHTWJ", name: "pool", type: "orchestration · nullifiers", status: "52/52 TESTS PASS", meta: "no double-spend", icon: "layers" },
    { tag: "SOROBAN", code: "CACHZSW…3PUNE", name: "transfer verifier", type: "shielded JoinSplit", status: "VERIFY → TRUE", meta: "BN254", icon: "chip" },
    { tag: "SOROBAN", code: "CDXYGM3…XBCG2", name: "compliance verifier", type: "ASP allow / deny", status: "VERIFY → TRUE", meta: "tx ✓", icon: "shield" },
    { tag: "SOROBAN", code: "CAYGURQ…J4W4V", name: "disclosure verifier", type: "selective disclosure", status: "VERIFY → TRUE", meta: "tamper → reject", icon: "eye" },
    { tag: "SOROBAN", code: "CCA3T54…S3X6H", name: "merkleUpdate verifier", type: "trustless root advance", status: "VERIFY → TRUE", meta: "fake → reject", icon: "tree" },
    { tag: "SOROBAN", code: "CDGOSIZ…KLHVR", name: "threshold verifier", type: "amount ≤ figure, hidden", status: "VERIFY → TRUE", meta: "amount hidden", icon: "eye" },
    { tag: "SOROBAN", code: "CCTN437…AZJYA", name: "aggregate verifier", type: "Σ portfolio ≤ cap", status: "VERIFY → TRUE", meta: "audit-bound", icon: "layers" },
    { tag: "SOROBAN", code: "CDUONEV…NUPQW", name: "range verifier", type: "lower ≤ amount ≤ upper", status: "VERIFY → TRUE", meta: "amount hidden", icon: "eye" },
  ],
  flow: [
    { tag: "EDGE A", code: "fiat → USDC", name: "Deposit", type: "compliance proof bound", status: "ON-CHAIN", meta: "pinned ASP", icon: "in" },
    { tag: "CORRIDOR", code: "shielded", name: "Transfer", type: "spend · record", status: "PRIVATE", meta: "hidden", icon: "swap" },
    { tag: "TREE", code: "register_root", name: "Update", type: "merkleUpdate proof", status: "TRUSTLESS", meta: "enforced", icon: "refresh" },
    { tag: "EDGE B", code: "USDC → fiat", name: "Withdraw", type: "amount bound to proof", status: "ON-CHAIN", meta: "AmountNotBound", icon: "out" },
  ],
  disclosure: [
    { tag: "REGULATOR", code: "audit request", name: "Open commitment", type: "opens to one amount", status: "PROVEN", meta: "bound", icon: "eye" },
    { tag: "OFF-CHAIN", code: "false witness", name: "Soundness", type: "false witness rejected", status: "REJECTED", meta: "neg test", icon: "shield" },
    { tag: "ON-CHAIN", code: "tampered input", name: "Tamper check", type: "tampered public input", status: "INVALIDPROOF", meta: "on-chain", icon: "alert" },
    { tag: "PRIVACY", code: "pool", name: "No graph leak", type: "payment graph hidden", status: "PRIVATE", meta: "selective", icon: "lock" },
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

function IconSVG({ name }: { name: keyof typeof ICONS }) {
  const paths = ICONS[name] || ICONS.swap;
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ff8a3d" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

function CircCard({ c }: { c: Card }) {
  return (
    <div className="circ-card">
      <div className="circ-vis">
        <span className="circ-icon">
          <IconSVG name={c.icon} />
        </span>
        <span className="circ-led" />
      </div>
      <div className="circ-meta">
        <div className="circ-tag">{c.tag}</div>
        <div className="circ-code">{c.code}</div>
        <div className="circ-name">{c.name}</div>
        <div className="circ-type">{c.type}</div>
      </div>
      <div className="hr-card" />
      <div className="circ-foot">
        <div className="circ-status">
          <span className="dot" />
          {c.status}
        </div>
        <div className="meta">{c.meta}</div>
      </div>
    </div>
  );
}

export function CircuitsTabs() {
  const [active, setActive] = useState<TabKey>("circuits");
  return (
    <>
      <div id="contracts" className="tabs" role="tablist" aria-label="Corridor layers">
        {TABS.map((t) => (
          <button
            key={t.key}
            className="tab"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card-grid">
        {DATA[active].map((c, i) => (
          <CircCard key={i} c={c} />
        ))}
      </div>
    </>
  );
}

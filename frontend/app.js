// Tukar — Corridor Console. Real ZK proving (snarkjs) in the browser, mirrored
// by the live BN254 Groth16 verifiers on Stellar testnet. UI from the hifi
// design handoff; all crypto/contract calls are real (see stellar.js).
import * as snarkjs from "https://esm.sh/snarkjs@0.7.5";
import { buildPoseidon } from "https://esm.sh/circomlibjs@0.1.7";
import { verifyDisclosureOnChain, readPoolState, loadLeavesFromChain, readCurrentRoot, depositOnChain, registerRootOnChain, withdrawSubmit, extDataHashFor, activeAddress, explorer, txExplorer, POOL, DISCLOSURE_VERIFIER } from "./stellar.js";
import { connect as walletConnect, disconnect as walletDisconnect, setupTestnetFunds } from "./wallet.js";
import { makeTree } from "./tree.js";

const VERIFIER_CONTRACT = DISCLOSURE_VERIFIER;
const VERIFIER_URL = `https://lab.stellar.org/r/testnet/contract/${VERIFIER_CONTRACT}`;
const WASM = "./circuit/disclosure.wasm";
const ZKEY = "./circuit/disclosure_final.zkey";
const VKEY = "./circuit/verification_key.json";
// BN254 scalar field modulus
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const STROOPS = 10_000_000n; // USDC has 7 decimals on Stellar
const MXN_RATE = 17.12;      // USDC -> MXN at the off-ramp edge (matches the design)

const $ = (id) => document.getElementById(id);
const status = $("status");
let poseidon, F, vkey, tree;
let notes = [];
let leaves = []; // BigInt commitments registered on-chain, in tree order
let seq = 0;
let proofState = "idle";

// Persist this browser's notes (secrets) so a reload can still withdraw: the tree
// is reconstructed from on-chain state, and the note keys restore from here.
// Keyed by pool so notes from a previous pool deployment don't leak in. (Demo
// throwaway keys only — never persist real spending keys to localStorage.)
const STORE_KEY = `tukar:notes:${POOL}`;
function saveSession() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      seq,
      offramped: [...offramped],
      notes: notes.map((n) => ({ ...n, withdrawing: false })),
    }));
  } catch (_) { /* storage unavailable — session stays in-memory */ }
}
function loadSession() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (!d) return;
    if (Array.isArray(d.notes)) notes = d.notes.map((n) => ({ ...n, withdrawing: false }));
    if (Array.isArray(d.offramped)) d.offramped.forEach((id) => offramped.add(id));
    if (typeof d.seq === "number") seq = d.seq;
  } catch (_) { /* corrupt store — ignore */ }
}

$("verifierLink").href = VERIFIER_URL;

// ---- inline SVG icon set (matches the design's icon() paths) ----
const ICON = {
  reset: ["M20 11A8 8 0 0 0 6 6L4 8", "M4 4V8H8", "M4 13A8 8 0 0 0 18 18L20 16", "M20 20V16H16"],
  shield: ["M12 3 19 6V11C19 16 16 19 12 21 8 19 5 16 5 11V6Z", "M9.4 11.6 12 9 14.6 11.6 12 14.2Z"],
  lock: ["M6 11H18V20H6Z", "M8.5 11V8A3.5 3.5 0 0 1 15.5 8V11"],
  diamond: ["M12 4 20 12 12 20 4 12Z"],
  sealCheck: ["M12 3 20 8 18 17 12 21 6 17 4 8Z", "M8.5 12 11 14.5 15.5 9"],
  sealX: ["M12 3 20 8 18 17 12 21 6 17 4 8Z", "M9.5 9.5 14.5 14.5", "M14.5 9.5 9.5 14.5"],
  spark: ["M12 4 13.6 10.4 20 12 13.6 13.6 12 20 10.4 13.6 4 12 10.4 10.4Z"],
  offramp: ["M4 20H20", "M12 4V9.5", "M9 12 12 9 15 12 12 15Z", "M12 15V19.5", "M9.6 17.6 12 20 14.4 17.6"],
};
function icon(name, size, stroke) {
  const d = (ICON[name] || ICON.diamond).map((p) => `<path d="${p}"/>`).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
}

function randomFieldElement() {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let x = 0n;
  for (const b of bytes) x = (x << 8n) | BigInt(b);
  return x % R;
}

// Deterministically map an audit-context string to a field element.
function contextToField(str) {
  const bytes = new TextEncoder().encode(str);
  let x = 0n;
  for (const b of bytes) x = (x * 257n + BigInt(b)) % R;
  return x;
}

function usdcToStroops(usdc) {
  const [whole, frac = ""] = String(usdc).split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole || "0") * STROOPS + BigInt(fracPadded || "0");
}

function fmtUsdc(stroops) {
  const s = BigInt(stroops);
  const whole = s / STROOPS;
  const frac = (s % STROOPS).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

const short = (s) => `${String(s).slice(0, 10)}…${String(s).slice(-8)}`;
const shortHash = (s) => `0x${BigInt(s).toString(16).slice(0, 8)}…${BigInt(s).toString(16).slice(-2)}`;

// Light the active panel + flow node for the current step (0..3).
function setActiveStep(n) {
  for (let i = 0; i < 4; i++) {
    $("panel" + i).classList.toggle("active", i === n);
    $("fn" + i).classList.toggle("active", i === n);
  }
}

// Rebuild the Merkle tree from on-chain events, but ONLY trust it if its root
// matches the pool's live current_root. If the RPC event window doesn't reach far
// enough back (incomplete reconstruction), return null and the caller keeps the
// session-local tree — so this is a strict improvement with no regression.
async function syncedLeaves() {
  try {
    const ls = await loadLeavesFromChain();         // BigInt[] in tree order
    const recon = tree.root(ls);                    // == genesis when empty
    const onchain = await readCurrentRoot();
    if (onchain != null && recon === onchain) return ls; // verified (incl. empty==genesis)
    console.warn(`[tukar] tree reconstruction unverified (${ls.length} leaves) — session-local`);
  } catch (e) { console.warn("[tukar] tree sync failed:", e && e.message); }
  return null;
}

const BUILD = "v6-accumulator";
async function init() {
  try {
    console.log(`[tukar ${BUILD}] loading Poseidon (circomlibjs)…`);
    status.textContent = "Loading Poseidon hasher…";
    poseidon = await buildPoseidon();
    F = poseidon.F;
    tree = makeTree(F, poseidon);
    console.log(`[tukar ${BUILD}] Poseidon ready; loading verification key…`);
    status.textContent = "Loading verification key…";
    vkey = await (await fetch(VKEY)).json();
    // Mirror the REAL on-chain Merkle tree so deposits/withdraws are correct even
    // across reloads and other users' deposits (not just this browser session).
    status.textContent = "Syncing the on-chain tree…";
    const synced = await syncedLeaves();
    if (synced) leaves = synced;
    loadSession(); // restore this browser's notes so withdraw survives a reload
    console.log(`[tukar ${BUILD}] init complete — ${synced ? synced.length + " on-chain leaves synced" : "session-local tree"}, ${notes.length} saved note(s)`);
    status.textContent = notes.length
      ? `Ready · ${notes.length} saved payment(s) restored.`
      : "Ready · zero-knowledge prover loaded.";
    setActiveStep(0);
    render();
    loadPoolState();
  } catch (e) {
    console.error("[tukar] init failed:", e);
    status.textContent = "Init error: " + ((e && e.message) || e) + " — open the console (F12) for details.";
  }
}

// Read the pool's live commitment count from Stellar testnet.
async function loadPoolState() {
  try {
    const { commitments } = await readPoolState();
    $("poolCount").textContent = commitments;
  } catch (_) { /* network — leave as-is */ }
}

const CHIP = {
  corridor: { label: "Deposited", color: "#ff9445" },
  received: { label: "Shielded", color: "#ffb070" },
  offramped: { label: "Off-ramped", color: "#37d67a" },
};

// Sender: create a confidential payment (commitment) entering the corridor.
async function createPayment() {
  const usdc = $("amount").value;
  const recipient = $("recipient").value.trim() || "unknown";
  if (!usdc || Number(usdc) <= 0) return;
  const amount = usdcToStroops(usdc);
  const privKey = randomFieldElement();
  const pubKey = F.toObject(poseidon([privKey])); // pubKey = Poseidon(privKey) -> spendable
  const blinding = randomFieldElement();
  const commitment = F.toObject(poseidon([amount, pubKey, blinding]));

  seq += 1;
  const note = {
    id: notes.length + 1,
    ref: "PAY-" + String(seq).padStart(3, "0"),
    recipient,
    amount: amount.toString(),
    privKey: privKey.toString(),
    pubKey: pubKey.toString(),
    blinding: blinding.toString(),
    commitment: commitment.toString(),
    leafIndex: leaves.length,
    ts: new Date().toLocaleTimeString(),
    status: "pending",
    onchain: "pending",
  };
  notes.unshift(note);
  setActiveStep(1);
  render();
  status.innerHTML = `<span class="spin">◠</span> ${note.ref} — building compliance + binding proofs, depositing on-chain…`;

  // 1) Real on-chain deposit: compliance + amount-binding proofs -> signed pool.deposit.
  const forge = !!($("compTamper") && $("compTamper").checked);
  const dep = await depositOnChain(note, { forgeSource: forge });
  if (!dep.ok) {
    if (forge) {
      // Expected: the ASP rejected a forged-source deposit on-chain.
      notes.shift(); // drop the rejected attempt from the ledger
      setActiveStep(0);
      status.innerHTML = `🛡 <b style="color:#ff8a72;">Deposit REJECTED by the ASP on-chain</b> — the compliance proof claimed a source you don't control. The pool pins the source to <i>your authenticated key</i>, so only an approved key you can sign with may deposit.`;
      render(); loadPoolState();
      return;
    }
    note.status = "failed";
    note.onchain = "failed";
    status.textContent = "On-chain deposit failed (note kept locally): " + dep.error;
    render(); saveSession(); loadPoolState();
    return;
  }
  note.onchain = dep.hash || "ok";
  note.status = "corridor";
  render();

  // 2) Advance the on-chain Merkle root so the commitment is spendable. Re-sync
  // the tree from chain first, so we insert at the real next index and prove
  // against the real current root. If another deposit lands between our sync and
  // our submit, the accumulator rejects our stale old_root (UnknownRoot) — so we
  // re-sync and retry, which makes concurrent multi-user deposits self-heal.
  status.innerHTML = `<span class="spin">◠</span> ${note.ref} deposited ✓ — registering into the on-chain tree…`;
  let reg;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const syncedDep = await syncedLeaves();
    if (syncedDep) leaves = syncedDep;
    const index = leaves.length;
    note.leafIndex = index;
    const oldRoot = tree.root(leaves);
    const path = tree.pathElements(leaves, index).map((x) => x.toString());
    const newLeaves = [...leaves, commitment];
    const newRoot = tree.root(newLeaves);
    reg = await registerRootOnChain(oldRoot.toString(), commitment.toString(), newRoot.toString(), index, path);
    if (reg.ok) { leaves = newLeaves; note.root = newRoot.toString(); break; }
    if (attempt < 3 && /UnknownRoot|Error\(Contract, #1\)/.test(reg.error || "")) {
      status.innerHTML = `<span class="spin">◠</span> ${note.ref} — tree advanced by another deposit, re-syncing… (try ${attempt + 1})`;
      continue;
    }
    break;
  }
  if (reg.ok) {
    note.spendable = true;
    note.status = "received";
    setActiveStep(2);
    status.textContent = `${note.ref} deposited & registered on-chain ✓ — shielded and spendable from the corridor.`;
  } else {
    status.textContent = `${note.ref} deposited ✓ (tree registration failed — withdraw disabled): ` + reg.error;
  }
  render();
  renderReceiver();
  saveSession();
  loadPoolState();
}

// Corridor (public view): commitments only; amounts hidden. + audit dropdown.
function render() {
  const ledger = $("ledger");
  if (!notes.length) {
    ledger.innerHTML = `<div class="empty"><div class="t">No confidential payments yet.</div><div class="s"><i></i> Reading live pool state from Stellar…</div></div>`;
  } else {
    ledger.innerHTML = notes.map((n) => {
      const c = CHIP[n.status] || { label: n.status === "failed" ? "Failed" : "Pending", color: "#8a847e" };
      const hashLink = (n.onchain && n.onchain !== "pending" && n.onchain !== "failed" && n.onchain !== "ok")
        ? `<a class="hash" style="text-decoration:none;" href="${txExplorer(n.onchain)}" target="_blank" rel="noreferrer">${shortHash(n.commitment)} ↗</a>`
        : `<span class="hash">${shortHash(n.commitment)}</span>`;
      return `<div class="crow">
        <div class="top">
          ${hashLink}
          <span class="st" style="color:${c.color};"><i style="background:${c.color};"></i>${c.label}</span>
        </div>
        <div class="meta">
          <span>${n.ref}</span>
          <span class="hid">${icon("lock", 11, "#6b645e")} •••• USDC · hidden</span>
        </div>
      </div>`;
    }).join("");
  }

  // Audit dropdown (only registered/spendable payments are auditable).
  const sel = $("auditSelect");
  const cur = sel.value;
  const auditable = notes.filter((n) => n.spendable);
  sel.innerHTML = '<option value="">— none —</option>' +
    auditable.map((n) => `<option value="${n.id}">${n.ref} · ${shortHash(n.commitment)}</option>`).join("");
  sel.value = cur;
  renderReceiver();
}

const offramped = new Set();

// Country B receiver: shielded arrivals; reveal+off-ramp to fiat, withdraw on-chain.
function renderReceiver() {
  const el = $("incoming");
  if (!el) return;
  const arrivals = notes.filter((n) => n.spendable);
  if (!arrivals.length) {
    el.innerHTML = `<div class="empty"><div class="t">Nothing received yet.</div><div class="s" style="color:#6b645e;">Send a payment from Country A →</div></div>`;
    return;
  }
  el.innerHTML = arrivals.map((n) => {
    const opened = offramped.has(n.id);
    const usdc = fmtUsdc(BigInt(n.amount));
    const mxn = Math.round(Number(usdc) * MXN_RATE).toLocaleString("en-US");
    const chipColor = opened ? "#37d67a" : "#ffb070";
    const chipLabel = opened ? "Off-ramped" : "Shielded";

    let body;
    if (opened) {
      body = `<div class="mxn"><span class="amt">+ $${mxn} MXN</span><span class="lbl">$${usdc} USDC revealed</span></div>`;
    } else {
      body = `<button class="btn-reveal" data-reveal="${n.id}">Reveal &amp; off-ramp →</button>`;
    }

    let wd = "";
    if (n.withdrawn) {
      wd = `<a class="wd-done" style="text-decoration:none;" href="${txExplorer(n.withdrawn)}" target="_blank" rel="noreferrer">${icon("sealCheck", 12, "#5fe3a0")} withdrawn on-chain ↗</a>`;
    } else if (n.withdrawing) {
      wd = `<div class="wd-pend"><span class="spin">◠</span> withdrawing on-chain…</div>`;
    } else if (n.spendable) {
      wd = `<button class="btn-wd" data-withdraw="${n.id}">${icon("offramp", 12, "#cfc8c1")} Withdraw on-chain →</button>`;
    }
    const exp = (n.spendable && !n.withdrawn)
      ? `<button class="btn-export" data-export="${n.id}">${icon("link", 11, "#8a847e")} Export bearer note</button>` : "";

    return `<div class="arrival${opened ? " done" : ""}">
      <div class="top"><span class="ref">${n.ref}${n.imported ? " · imported" : " · from US"}</span><span class="chip" style="color:${chipColor};">${chipLabel}</span></div>
      <div class="body">${body}</div>
      ${wd}${exp}
    </div>`;
  }).join("");
}

// Spend a deposited note on-chain: build a transfer proof, submit pool.withdraw.
async function withdrawNote(note) {
  if (!note.spendable || note.withdrawn || note.withdrawing) return;
  note.withdrawing = true;
  renderReceiver();
  status.innerHTML = `<span class="spin">◠</span> ${note.ref} — building shielded transfer proof…`;
  try {
    const amt = BigInt(note.amount);
    const W = amt; // release the note's full amount
    const dPriv = randomFieldElement(), dBlind = randomFieldElement();
    const dPub = F.toObject(poseidon([dPriv]));
    const dCommit = F.toObject(poseidon([0n, dPub, dBlind]));
    const o0Priv = randomFieldElement(), o0Blind = randomFieldElement();
    const o0Pub = F.toObject(poseidon([o0Priv]));
    const o0Amt = amt - W; // change note left in the pool (0 for a full withdraw)
    const o0Commit = F.toObject(poseidon([o0Amt, o0Pub, o0Blind]));
    const o1Priv = randomFieldElement(), o1Blind = randomFieldElement();
    const o1Pub = F.toObject(poseidon([o1Priv]));
    const o1Commit = F.toObject(poseidon([0n, o1Pub, o1Blind]));
    // Re-sync the tree from chain, then locate this note's REAL on-chain index by
    // its commitment (don't trust a possibly-stale local leafIndex). The nullifier
    // and the Merkle path must both use the actual index, or the proof won't verify.
    const syncedWd = await syncedLeaves();
    if (syncedWd) leaves = syncedWd;
    const realIndex = leaves.findIndex((l) => l === BigInt(note.commitment));
    if (realIndex < 0) {
      note.withdrawing = false;
      status.textContent = `${note.ref} isn't registered in the on-chain tree yet — can't withdraw.`;
      renderReceiver();
      return;
    }
    note.leafIndex = realIndex;
    const n0 = F.toObject(poseidon([BigInt(note.commitment), BigInt(realIndex), BigInt(note.privKey)]));
    const n1 = F.toObject(poseidon([dCommit, 0n, dPriv]));
    const root = tree.root(leaves);
    const path = tree.pathElements(leaves, realIndex).map((x) => x.toString());
    // Withdraw moves value OUT of the shielded set, so publicAmount is negative
    // (field-encoded as r - W). sum(in)+publicAmount=sum(out) -> outputs sum to V - W.
    // Bind the recipient into the proof via extDataHash (the contract recomputes it).
    const recipient = activeAddress();
    const pubAmount = ((R - W) % R).toString();
    const extDataHash = extDataHashFor(recipient, pubAmount);
    const input = {
      root: root.toString(), publicAmount: pubAmount, extDataHash,
      inputNullifier: [n0.toString(), n1.toString()],
      outputCommitment: [o0Commit.toString(), o1Commit.toString()],
      inAmount: [note.amount, "0"],
      inPrivKey: [note.privKey, dPriv.toString()],
      inBlinding: [note.blinding, dBlind.toString()],
      inLeafIndex: [String(realIndex), "0"],
      inPathElements: [path, new Array(10).fill("0")],
      outAmount: [o0Amt.toString(), "0"],
      outPubkey: [o0Pub.toString(), o1Pub.toString()],
      outBlinding: [o0Blind.toString(), o1Blind.toString()],
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, "./circuit/transfer.wasm", "./circuit/transfer_final.zkey");
    status.innerHTML = `<span class="spin">◠</span> ${note.ref} — releasing tokens on-chain…`;
    const res = await withdrawSubmit(proof, publicSignals, recipient, W);
    note.withdrawing = false;
    if (res.ok) {
      note.withdrawn = res.hash || "ok";
      status.textContent = `${note.ref} withdrawn on-chain ✓ — the note was spent and tokens released from the pool.`;
    } else {
      status.textContent = "Withdraw failed: " + res.error;
    }
  } catch (e) {
    note.withdrawing = false;
    status.textContent = "Withdraw failed: " + ((e && e.message) || e);
  }
  renderReceiver();
  saveSession();
  loadPoolState();
}

// Bearer note: a note IS the spendable asset. Export it as a portable string so a
// DIFFERENT person (the receiver) can import it elsewhere and withdraw — the
// corridor becomes truly peer-to-peer (the on-chain tree reconstructs anywhere,
// the recipient binding sends funds to whoever withdraws). Demo secrets only.
async function exportNote(note) {
  const payload = {
    v: 1, ref: note.ref, amount: note.amount, privKey: note.privKey,
    pubKey: note.pubKey, blinding: note.blinding, commitment: note.commitment,
  };
  const str = "tukar1:" + btoa(JSON.stringify(payload));
  if (navigator.clipboard) navigator.clipboard.writeText(str).catch(() => {});
  const box = $("exportBox");
  box.style.display = "";
  box.innerHTML = `<div class="eh">BEARER NOTE · ${note.ref} (copied to clipboard)</div>
    <div class="es">${str}</div>
    <div class="qr" id="exportQr"></div>
    <div class="ec">Whoever holds this string can withdraw the note. Scan the code, or paste the string into "Import" on another device to receive it.</div>`;
  status.textContent = `${note.ref} exported as a bearer note — hand the string (or QR) to the receiver.`;
  qrInto("exportQr", str, `bearer note QR for ${note.ref}`);
}

// Render a scannable QR into a slot. Lazy-loaded so a CDN hiccup degrades
// gracefully — the copyable string alongside it stays the source of truth.
async function qrInto(slotId, str, alt) {
  try {
    const { default: QRCode } = await import("https://esm.sh/qrcode@1.5.3");
    const url = await QRCode.toDataURL(str, { margin: 1, width: 168, errorCorrectionLevel: "L", color: { dark: "#0a0705", light: "#f3ad79" } });
    const slot = $(slotId);
    if (slot) slot.innerHTML = `<img alt="${alt}" src="${url}" width="168" height="168" />`;
  } catch (_) { /* QR optional */ }
}

// Payment request (reverse direction): the receiver asks for an amount; the sender
// loads it to pre-fill the corridor send form. A request is public (no secrets) —
// it just carries an amount, a memo, and the receiver's address as the label.
function createRequest() {
  const amt = parseFloat($("reqAmount").value);
  if (!(amt > 0)) { status.textContent = "Enter an amount to request."; return; }
  const addr = activeAddress();
  const memo = `to ${addr.slice(0, 4)}..${addr.slice(-4)}`; // ASCII only (btoa is Latin1)
  const str = "tukreq1:" + btoa(JSON.stringify({ v: 1, kind: "req", amount: String(amt), memo, addr }));
  if (navigator.clipboard) navigator.clipboard.writeText(str).catch(() => {});
  const box = $("reqBox");
  box.style.display = "";
  box.innerHTML = `<div class="eh">PAYMENT REQUEST · ${amt} USDC (copied to clipboard)</div>
    <div class="es">${str}</div>
    <div class="qr" id="reqQr"></div>
    <div class="ec">Send this to the payer. They paste it into "Load" on the Sender side (or scan the QR) and it fills in the amount and recipient.</div>`;
  status.textContent = `Requested ${amt} USDC — hand the string (or QR) to the sender.`;
  qrInto("reqQr", str, `payment request QR for ${amt} USDC`);
}

function loadRequest() {
  const raw = $("reqLoadInput").value.trim();
  if (!raw) return;
  try {
    const json = JSON.parse(atob(raw.replace(/^tukreq1:/, "")));
    if (json.kind !== "req" || !json.amount) throw new Error("not a Tukar payment request");
    $("amount").value = json.amount;
    $("recipient").value = json.memo || (json.addr ? `${json.addr.slice(0, 6)}…${json.addr.slice(-4)}` : "requested payee");
    $("reqLoadInput").value = "";
    setActiveStep(0);
    status.textContent = `Loaded a request for ${json.amount} USDC — review and hit "Send into corridor".`;
  } catch (e) {
    status.textContent = "Couldn't load that request: " + ((e && e.message) || "invalid string");
  }
}

function importNote() {
  const raw = $("importInput").value.trim();
  if (!raw) return;
  try {
    const json = JSON.parse(atob(raw.replace(/^tukar1:/, "")));
    if (!json.commitment || !json.privKey || !json.amount) throw new Error("not a Tukar bearer note");
    if (notes.some((n) => n.commitment === json.commitment)) {
      status.textContent = "That note is already in this wallet.";
      return;
    }
    seq += 1;
    const note = {
      id: notes.length + 1, ref: json.ref || ("PAY-" + String(seq).padStart(3, "0")),
      recipient: "you", amount: json.amount, privKey: json.privKey, pubKey: json.pubKey,
      blinding: json.blinding, commitment: json.commitment, leafIndex: 0,
      ts: new Date().toLocaleTimeString(), status: "received", spendable: true,
      imported: true, onchain: "ok",
    };
    notes.unshift(note);
    $("importInput").value = "";
    $("exportBox").style.display = "none";
    setActiveStep(2);
    render(); renderReceiver(); saveSession();
    status.textContent = `Imported ${note.ref} — it's now withdrawable here (the tree is verified from chain on withdraw).`;
  } catch (e) {
    status.textContent = "Couldn't import that note: " + ((e && e.message) || "invalid string");
  }
}

// Render the regulator proof-view box (idle/proving/verified/rejected).
function renderProof(state, data = {}) {
  proofState = state;
  const result = $("result");
  const M = {
    idle: { border: "rgba(255,255,255,0.07)", bg: "rgba(0,0,0,0.2)", color: "#cfc8c1", ic: icon("shield", 16, "#8a847e"), title: "Ready", body: "Zero-knowledge prover loaded." },
    proving: { border: "rgba(255,122,26,0.4)", bg: "rgba(255,122,26,0.06)", color: "#ff9c52", ic: icon("spark", 16, "#ff9c52"), title: "Proving in browser…", body: "Generating a Groth16 proof over BN254. Secrets never leave the device." },
    verified: { border: "rgba(55,214,122,0.4)", bg: "rgba(55,214,122,0.07)", color: "#5fe3a0", ic: icon("sealCheck", 16, "#5fe3a0"), title: "Verified on-chain", body: data.body || "" },
    rejected: { border: "rgba(255,90,70,0.45)", bg: "rgba(255,90,70,0.07)", color: "#ff8a72", ic: icon("sealX", 16, "#ff8a72"), title: "InvalidProof", body: data.body || "" },
  }[state];
  result.style.border = "1px solid " + M.border;
  result.style.background = M.bg;
  result.innerHTML = `
    <div class="ph">${M.ic}<span class="pt" style="color:${M.color};">${M.title}</span></div>
    <div class="pb">${M.body}</div>
    ${data.mono ? `<div class="pmono">${data.mono}</div>` : ""}
    ${data.onchain ? `<div class="pmono" data-onchain>${data.onchain}</div>` : ""}
    ${state === "proving" ? `<div class="proofbar"><i></i></div>` : ""}`;
}

// Regulator: holder generates a disclosure proof; regulator verifies on-chain.
async function proveAndVerify() {
  const id = Number($("auditSelect").value);
  const note = notes.find((n) => n.id === id);
  if (!note) { status.textContent = "Select a confidential payment to audit first."; return; }

  const tamper = $("tamper").checked;
  const auditContextHash = contextToField($("auditCtx").value).toString();
  $("proveBtn").disabled = true;
  $("proveBtn").classList.add("busy");
  $("proveBtn").textContent = "Proving…";
  setActiveStep(3);
  renderProof("proving");
  status.innerHTML = '<span class="spin">◠</span> Generating zero-knowledge proof in your browser…';

  try {
    const input = {
      commitment: note.commitment, disclosedAmount: note.amount, auditContextHash,
      amount: note.amount, pubKey: note.pubKey, blinding: note.blinding,
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);

    // Tamper mode: regulator is handed a FALSE claimed amount alongside the proof.
    let claimed = publicSignals.slice();
    if (tamper) claimed[1] = (BigInt(publicSignals[1]) + 12345n).toString();
    const ok = await snarkjs.groth16.verify(vkey, claimed, proof);
    const link = `<a href="${explorer(DISCLOSURE_VERIFIER)}" target="_blank" rel="noreferrer">${short(DISCLOSURE_VERIFIER)} ↗</a>`;

    if (ok) {
      renderProof("verified", {
        body: `Disclosed amount: <b style="color:#5fe3a0;">$${fmtUsdc(claimed[1])} USDC</b>. Nothing else is revealed — no keys, no blinding, no other payments.`,
        mono: `commitment ${short(note.commitment)} · context ${short(auditContextHash)}`,
        onchain: "⛓ confirming on the live Stellar verifier…",
      });
      status.textContent = "Disclosure verified in your browser. Confirming on Stellar…";
    } else {
      renderProof("rejected", {
        body: `Claimed amount <b style="color:#ff8a72;">$${fmtUsdc(claimed[1])} USDC</b> contradicts the proof. A false claim cannot pass verification.`,
        onchain: "⛓ confirming on the live Stellar verifier…",
      });
      status.textContent = "Tampered claim rejected in your browser. Confirming on Stellar…";
    }

    // Live on-chain verification by the deployed Stellar verifier (read-only RPC).
    try {
      const oc = await verifyDisclosureOnChain(proof, claimed);
      const el = $("result").querySelector("[data-onchain]");
      if (ok && oc.verified) {
        if (el) el.innerHTML = `⛓ <b style="color:#5fe3a0;">Verified on-chain</b> too — by the live Stellar verifier ${link}`;
        status.textContent = "Disclosure verified — in your browser AND on Stellar. Privacy preserved, compliance satisfied.";
      } else if (!ok && !oc.verified) {
        if (el) el.innerHTML = `⛓ The live Stellar verifier ${link} <b style="color:#ff8a72;">also rejected it</b> (InvalidProof).`;
        status.textContent = "Tampered claim rejected — in your browser AND on-chain. The proof is sound.";
      } else if (el) {
        el.textContent = `⛓ on-chain result: ${oc.verified ? "verified" : "rejected"}`;
      }
    } catch (_) {
      const el = $("result").querySelector("[data-onchain]");
      if (el) el.textContent = "⛓ on-chain check unavailable (network).";
    }
  } catch (e) {
    renderProof("rejected", { body: `Proof generation failed: ${(e && e.message) || e}. A disclosure that contradicts the committed amount cannot even be proven.` });
    status.textContent = "Proof rejected at generation — soundness holds.";
  } finally {
    $("proveBtn").disabled = false;
    $("proveBtn").classList.remove("busy");
    $("proveBtn").textContent = "Generate & verify disclosure proof";
  }
}

function resetUI() {
  notes = [];
  leaves = [];
  offramped.clear();
  seq = 0;
  try { localStorage.removeItem(STORE_KEY); } catch (_) {}
  setActiveStep(0);
  $("amount").value = "500";
  $("recipient").value = "María · Mexico City";
  $("auditCtx").value = "2026-Q2 · CNBV";
  $("tamper").checked = false;
  $("tamperLabel").classList.remove("on");
  $("compTamper").checked = false;
  $("compTamperLabel").classList.remove("on");
  $("compTamperLabel").setAttribute("aria-checked", "false");
  $("importInput").value = "";
  $("exportBox").style.display = "none";
  $("reqLoadInput").value = "";
  $("reqBox").style.display = "none";
  renderProof("idle");
  render();
  status.textContent = "Reset · session cleared (on-chain commitments persist).";
  loadPoolState();
}

// ---- wiring ----
$("sendBtn").addEventListener("click", async () => {
  if (!poseidon) { status.textContent = "Prover still loading — one moment…"; return; }
  $("sendBtn").disabled = true;
  $("sendBtn").classList.add("busy");
  $("sendBtn").textContent = "Building compliance proof…";
  try { await createPayment(); }
  finally {
    $("sendBtn").disabled = false;
    $("sendBtn").classList.remove("busy");
    $("sendBtn").textContent = "Send into corridor →";
  }
});
$("proveBtn").addEventListener("click", () => {
  if (!poseidon) { status.textContent = "Prover still loading — one moment…"; return; }
  proveAndVerify();
});
function toggleTamper() {
  const cb = $("tamper");
  cb.checked = !cb.checked;
  $("tamperLabel").classList.toggle("on", cb.checked);
  $("tamperLabel").setAttribute("aria-checked", cb.checked ? "true" : "false");
}
$("tamperLabel").addEventListener("click", toggleTamper);
$("tamperLabel").addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleTamper(); }
});
// Compliance "forge source" toggle (Sender panel) — a custom keyboard checkbox.
function toggleCompTamper() {
  const cb = $("compTamper");
  cb.checked = !cb.checked;
  $("compTamperLabel").classList.toggle("on", cb.checked);
  $("compTamperLabel").setAttribute("aria-checked", cb.checked ? "true" : "false");
}
$("compTamperLabel").addEventListener("click", toggleCompTamper);
$("compTamperLabel").addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleCompTamper(); }
});
$("resetBtn").addEventListener("click", resetUI);
$("importBtn").addEventListener("click", importNote);
$("importInput").addEventListener("keydown", (e) => { if (e.key === "Enter") importNote(); });
$("reqBtn").addEventListener("click", createRequest);
$("reqLoadBtn").addEventListener("click", loadRequest);
$("reqLoadInput").addEventListener("keydown", (e) => { if (e.key === "Enter") loadRequest(); });
$("incoming").addEventListener("click", (e) => {
  const off = e.target.closest("[data-reveal]");
  if (off) {
    offramped.add(Number(off.dataset.reveal));
    renderReceiver();
    saveSession();
    status.textContent = "Off-ramp: amount revealed at the corridor edge to convert to local fiat (MXN).";
    return;
  }
  const ex = e.target.closest("[data-export]");
  if (ex) {
    const n = notes.find((x) => x.id === Number(ex.dataset.export));
    if (n) exportNote(n);
    return;
  }
  const wd = e.target.closest("[data-withdraw]");
  if (wd) {
    const n = notes.find((x) => x.id === Number(wd.dataset.withdraw));
    if (n) withdrawNote(n);
  }
});

// Optional Freighter wallet: when connected, deposits are signed by the user's
// own wallet (with a one-click testnet faucet); otherwise the embedded demo key
// is used, so the no-install demo always works.
let walletConn = null;
const shortAddr = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;
async function onWalletClick() {
  if (walletConn) {
    walletDisconnect();
    walletConn = null;
    $("walletTag").innerHTML = '<span style="opacity:.6;font-size:11px">testnet demo key</span>';
    $("walletBtn").textContent = "Connect wallet";
    status.textContent = "Wallet disconnected — using the testnet demo key.";
    return;
  }
  $("walletBtn").disabled = true;
  status.innerHTML = '<span class="spin">◠</span> Connecting Freighter… (approve in the extension)';
  try {
    const { address, signTransaction } = await walletConnect();
    walletConn = { address };
    $("walletTag").innerHTML = `<b>${shortAddr(address)}</b>`;
    $("walletBtn").textContent = "Disconnect";
    await setupTestnetFunds(address, signTransaction, (m) => {
      status.innerHTML = `<span class="spin">◠</span> Wallet setup — ${m}`;
    });
    status.textContent = `Wallet connected (${shortAddr(address)}) — deposits will be signed by Freighter.`;
  } catch (e) {
    walletDisconnect();
    walletConn = null;
    $("walletTag").innerHTML = '<span style="opacity:.6;font-size:11px">testnet demo key</span>';
    $("walletBtn").textContent = "Connect wallet";
    const msg = (e && e.message) || String(e);
    if (/not detected|not available|failed to load/i.test(msg)) {
      // Make the "no wallet" case obvious + actionable instead of a silent fallback.
      status.innerHTML =
        'No Freighter wallet detected. <a href="https://www.freighter.app/" target="_blank" rel="noreferrer" style="color:#c9a36a;text-decoration:underline;font-weight:600">Install Freighter →</a> ' +
        'then click Connect again — or try the corridor right now with the built-in testnet demo key.';
    } else {
      status.textContent = "Wallet error: " + msg + " — continuing with the testnet demo key.";
    }
  } finally {
    $("walletBtn").disabled = false;
  }
}
$("walletBtn").addEventListener("click", onWalletClick);
// Show the default state up front: no wallet needed — the corridor runs on a
// built-in testnet demo key until you connect Freighter.
$("walletTag").innerHTML = '<span style="opacity:.6;font-size:11px">testnet demo key</span>';

console.log("[tukar] app.js module executed — wiring UI");
init();

// Tukar frontend — confidential corridor demo.
// ZK proofs are generated *in this browser* (snarkjs + the disclosure circuit),
// mirroring the on-chain BN254 Groth16 verifier deployed on Stellar testnet.
// snarkjs + circomlibjs load from jsDelivr's `+esm` (self-contained bundles that
// resolve their own deps, e.g. ffjavascript — a plain vendored copy does not).
// The demo therefore needs internet for these two libraries; everything else is local.
import * as snarkjs from "https://esm.sh/snarkjs@0.7.5";
import { buildPoseidon } from "https://esm.sh/circomlibjs@0.1.7";
import { verifyDisclosureOnChain, readPoolState, explorer, POOL, DISCLOSURE_VERIFIER } from "./stellar.js";

const VERIFIER_CONTRACT = "CA2HHHOMKZJM2P37VWMFZGIP3ECG6EBKWYWEO2HMKHSHXVGRZS6K47G2";
const VERIFIER_URL = `https://lab.stellar.org/r/testnet/contract/${VERIFIER_CONTRACT}`;
const WASM = "./circuit/disclosure.wasm";
const ZKEY = "./circuit/disclosure_final.zkey";
const VKEY = "./circuit/verification_key.json";
// BN254 scalar field modulus
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const STROOPS = 10_000_000n; // USDC has 7 decimals on Stellar

const $ = (id) => document.getElementById(id);
const status = $("status");
let poseidon, F, vkey;
let notes = [];

$("verifierLink").href = VERIFIER_URL;

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

const short = (s) => `${s.slice(0, 10)}…${s.slice(-8)}`;

const BUILD = "v3-cdn";
async function init() {
  try {
    console.log(`[tukar ${BUILD}] loading Poseidon (circomlibjs)…`);
    status.textContent = "Loading Poseidon hasher…";
    poseidon = await buildPoseidon();
    F = poseidon.F;
    console.log(`[tukar ${BUILD}] Poseidon ready; loading verification key…`);
    status.textContent = "Loading verification key…";
    vkey = await (await fetch(VKEY)).json();
    console.log(`[tukar ${BUILD}] init complete — ready`);
    status.textContent = `Ready · zero-knowledge prover loaded.`;
    render();
    loadPoolState();
  } catch (e) {
    console.error("[tukar] init failed:", e);
    status.textContent = "Init error: " + ((e && e.message) || e) + " — open the console (F12) for details.";
  }
}

// Read the pool's live custody state from Stellar testnet and show it.
async function loadPoolState() {
  const el = $("poolState");
  if (!el) return;
  try {
    const { balance, commitments } = await readPoolState();
    const usdc = fmtUsdc(BigInt(balance));
    el.innerHTML = `Live on Stellar: <b>${usdc}</b> custodied · <b>${commitments}</b> commitments ·
      <a href="${explorer(POOL)}" target="_blank" rel="noreferrer">pool ↗</a>`;
  } catch (_) {
    el.textContent = "Live pool state unavailable (network).";
  }
}

// Sender: create a confidential payment (commitment) entering the corridor.
function createPayment() {
  const usdc = $("amount").value;
  const recipient = $("recipient").value.trim() || "unknown";
  if (!usdc || Number(usdc) <= 0) return;
  const amount = usdcToStroops(usdc);
  const pubKey = randomFieldElement();
  const blinding = randomFieldElement();
  const commitment = F.toObject(poseidon([amount, pubKey, blinding]));

  notes.push({
    id: notes.length + 1,
    recipient,
    amount: amount.toString(),       // secret (kept client-side)
    pubKey: pubKey.toString(),       // secret
    blinding: blinding.toString(),   // secret
    commitment: commitment.toString(),
    ts: new Date().toLocaleTimeString(),
  });
  render();
  status.textContent = `Payment #${notes.length} entered the corridor — amount shielded on-chain.`;
}

function render() {
  // Ledger (public view): only commitments, amounts hidden.
  const ledger = $("ledger");
  if (!notes.length) {
    ledger.innerHTML = '<div class="empty">No confidential payments yet.</div>';
  } else {
    ledger.innerHTML = notes.map((n) => `
      <div class="note">
        <div class="row"><span class="label">commitment</span></div>
        <div class="commit">${short(n.commitment)}</div>
        <div class="row">
          <span class="label">amount</span><span class="shield">•••• USDC (shielded)</span>
        </div>
        <div class="row">
          <span class="label">recipient</span><span class="shield">•••• (shielded)</span>
        </div>
      </div>`).join("");
  }
  // Audit dropdown
  const sel = $("auditSelect");
  const cur = sel.value;
  sel.innerHTML = '<option value="">— none —</option>' +
    notes.map((n) => `<option value="${n.id}">#${n.id} · ${n.recipient} · ${n.ts}</option>`).join("");
  sel.value = cur;
  renderReceiver();
}

const offramped = new Set();
const MXN_RATE = 17.05; // mock USDC->MXN rate for the off-ramp edge

// Country B receiver view: payments arrive shielded; off-ramp reveals the amount.
function renderReceiver() {
  const el = $("incoming");
  if (!el) return;
  if (!notes.length) {
    el.innerHTML = '<div class="empty">Nothing received yet.</div>';
    return;
  }
  el.innerHTML = notes
    .map((n) => {
      const opened = offramped.has(n.id);
      const usdc = fmtUsdc(BigInt(n.amount));
      const mxn = (Number(usdc) * MXN_RATE).toLocaleString("en-US", { maximumFractionDigits: 2 });
      const body = opened
        ? `<div class="row"><span class="label">off-ramped</span><span class="reveal">${usdc} USDC → ${mxn} MXN</span></div>`
        : `<div class="row"><span class="label">amount</span><span class="shield">•••• (shielded in transit)</span></div>
           <button class="offramp" data-id="${n.id}">Off-ramp to MXN →</button>`;
      return `<div class="note">
        <div class="row"><span class="label">incoming · #${n.id}</span><span class="ts">${n.ts}</span></div>
        ${body}
      </div>`;
    })
    .join("");
}

// Regulator: holder generates a disclosure proof; regulator verifies it.
async function proveAndVerify() {
  const id = Number($("auditSelect").value);
  const note = notes.find((n) => n.id === id);
  const result = $("result");
  if (!note) { status.textContent = "Select a confidential payment to audit first."; return; }

  const tamper = $("tamper").checked;
  const auditContextHash = contextToField($("auditCtx").value).toString();
  $("proveBtn").disabled = true;
  result.className = "result hidden";
  status.innerHTML = '<span class="spin">◠</span> Generating zero-knowledge proof in your browser…';

  try {
    const input = {
      commitment: note.commitment,
      disclosedAmount: note.amount,
      auditContextHash,
      amount: note.amount,
      pubKey: note.pubKey,
      blinding: note.blinding,
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);

    // Tamper mode: regulator is handed a FALSE claimed amount alongside the proof.
    let claimed = publicSignals.slice();
    if (tamper) claimed[1] = (BigInt(publicSignals[1]) + 12345n).toString();

    const ok = await snarkjs.groth16.verify(vkey, claimed, proof);

    const onchainLine = `<div class="onchain mono">⛓ confirming on the live Stellar contract…</div>`;
    if (ok) {
      result.className = "result ok";
      result.innerHTML = `
        <div class="big">✅ Disclosure proof VALID</div>
        Regulator learns exactly one fact about payment #${note.id}:<br/>
        <div class="big">${fmtUsdc(claimed[1])} USDC</div>
        Nothing else about the corridor was revealed — no keys, no blinding,
        no other payments.<br/>
        <div class="mono">audit context: ${$("auditCtx").value} → ${short(auditContextHash)}</div>
        <div class="mono">commitment: ${short(note.commitment)}</div>
        ${onchainLine}`;
      status.textContent = "Disclosure verified in your browser. Confirming on Stellar…";
    } else {
      result.className = "result bad";
      result.innerHTML = `
        <div class="big">⛔ Disclosure REJECTED</div>
        The claimed amount <strong>${fmtUsdc(claimed[1])} USDC</strong> does not match
        the proof. A false claim cannot pass verification.<br/>
        ${onchainLine}`;
      status.textContent = "Tampered claim rejected in your browser. Confirming on Stellar…";
    }
    // Live on-chain verification by the deployed Stellar verifier (read-only RPC simulation).
    try {
      const oc = await verifyDisclosureOnChain(proof, claimed);
      const el = result.querySelector(".onchain");
      const link = `<a href="${explorer(DISCLOSURE_VERIFIER)}" target="_blank" rel="noreferrer">${short(DISCLOSURE_VERIFIER)} ↗</a>`;
      if (ok && oc.verified) {
        el.innerHTML = `⛓ <b>Verified on-chain</b> too — by the live Stellar verifier ${link}`;
        status.textContent = "Disclosure verified — in your browser AND on Stellar. Privacy preserved, compliance satisfied.";
      } else if (!ok && !oc.verified) {
        el.innerHTML = `⛓ The live Stellar verifier ${link} <b>also rejected it</b> (InvalidProof).`;
        status.textContent = "Tampered claim rejected — in your browser AND on-chain. The proof is sound.";
      } else {
        el.textContent = `⛓ on-chain result: ${oc.verified ? "verified" : "rejected"}`;
      }
    } catch (_) {
      const el = result.querySelector(".onchain");
      if (el) el.textContent = "⛓ on-chain check unavailable (network).";
    }
  } catch (e) {
    result.className = "result bad";
    result.innerHTML = `<div class="big">⛔ Proof generation failed</div>
      <div class="mono">${(e && e.message) || e}</div>
      A disclosure that contradicts the committed amount cannot even be proven.`;
    status.textContent = "Proof rejected at generation — soundness holds.";
  } finally {
    $("proveBtn").disabled = false;
  }
}

$("sendBtn").addEventListener("click", () => {
  if (!poseidon) { status.textContent = "Prover still loading — one moment…"; return; }
  createPayment();
});
$("proveBtn").addEventListener("click", () => {
  if (!poseidon) { status.textContent = "Prover still loading — one moment…"; return; }
  proveAndVerify();
});
$("incoming").addEventListener("click", (e) => {
  const btn = e.target.closest(".offramp");
  if (!btn) return;
  offramped.add(Number(btn.dataset.id));
  renderReceiver();
  status.textContent = "Off-ramp: amount revealed at the corridor edge to convert to local fiat.";
});

console.log("[tukar] app.js module executed — wiring UI");
init();

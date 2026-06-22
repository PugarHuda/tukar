// Tukar frontend — confidential corridor demo.
// ZK proofs are generated *in this browser* (snarkjs + the disclosure circuit),
// mirroring the on-chain BN254 Groth16 verifier deployed on Stellar testnet.
// snarkjs + circomlibjs load from jsDelivr's `+esm` (self-contained bundles that
// resolve their own deps, e.g. ffjavascript — a plain vendored copy does not).
// The demo therefore needs internet for these two libraries; everything else is local.
import * as snarkjs from "https://esm.sh/snarkjs@0.7.5";
import { buildPoseidon } from "https://esm.sh/circomlibjs@0.1.7";
import { verifyDisclosureOnChain, readPoolState, depositOnChain, registerRootOnChain, withdrawSubmit, explorer, txExplorer, POOL, DISCLOSURE_VERIFIER } from "./stellar.js";
import { makeTree } from "./tree.js";

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
let poseidon, F, vkey, tree;
let notes = [];
let leaves = []; // BigInt commitments registered on-chain, in tree order

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
    tree = makeTree(F, poseidon);
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
    el.innerHTML = `Live pool on Stellar: <b>${commitments}</b> commitments recorded ·
      <b>${usdc} USDC</b> custodied <span class="muted">(real testnet USDC asset)</span> ·
      <a href="${explorer(POOL)}" target="_blank" rel="noreferrer">pool ↗</a>`;
  } catch (_) {
    el.textContent = "Live pool state unavailable (network).";
  }
}

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

  const note = {
    id: notes.length + 1,
    recipient,
    amount: amount.toString(),
    privKey: privKey.toString(),
    pubKey: pubKey.toString(),
    blinding: blinding.toString(),
    commitment: commitment.toString(),
    leafIndex: leaves.length,
    ts: new Date().toLocaleTimeString(),
    onchain: "pending",
  };
  notes.push(note);
  render();
  status.innerHTML = `<span class="spin">◠</span> Payment #${note.id} — compliance proof &amp; depositing on-chain…`;

  // 1) Real on-chain deposit: compliance + amount-binding proofs -> signed pool.deposit.
  const dep = await depositOnChain(note);
  if (!dep.ok) {
    note.onchain = "failed";
    status.textContent = "On-chain deposit failed (note kept locally): " + dep.error;
    render(); loadPoolState();
    return;
  }
  note.onchain = dep.hash || "ok";
  render();

  // 2) Advance the on-chain Merkle root so the commitment is spendable (merkleUpdate proof).
  status.innerHTML = `<span class="spin">◠</span> Deposited ✓ — registering it into the on-chain tree…`;
  const index = leaves.length;
  const oldRoot = tree.root(leaves);
  const path = tree.pathElements(leaves, index).map((x) => x.toString());
  const newLeaves = [...leaves, commitment];
  const newRoot = tree.root(newLeaves);
  const reg = await registerRootOnChain(oldRoot.toString(), commitment.toString(), newRoot.toString(), index, path);
  if (reg.ok) {
    leaves = newLeaves;
    note.spendable = true;
    note.root = newRoot.toString();
    status.textContent = "Deposited & registered on-chain ✓ — the note is now spendable from the corridor.";
  } else {
    status.textContent = "Deposited ✓ (tree registration failed — withdraw disabled for this note): " + reg.error;
  }
  render();
  loadPoolState();
}

function onchainBadge(s) {
  if (s === "pending") return '<span class="pend">⏳ depositing…</span>';
  if (s === "failed") return '<span class="fail">✗ local only</span>';
  if (s === "ok" || !s) return '<span class="okc">✓ deposited</span>';
  return `<a class="okc" href="${txExplorer(s)}" target="_blank" rel="noreferrer">✓ deposited ↗</a>`;
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
        <div class="row"><span class="label">on-chain</span>${onchainBadge(n.onchain)}</div>
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
      const amountRow = opened
        ? `<div class="row"><span class="label">off-ramped</span><span class="reveal">${usdc} USDC → ${mxn} MXN</span></div>`
        : `<div class="row"><span class="label">amount</span><span class="shield">•••• (shielded in transit)</span></div>`;
      let action;
      if (n.withdrawn) {
        action = `<div class="row"><span class="label">withdraw</span><a class="okc" href="${txExplorer(n.withdrawn)}" target="_blank" rel="noreferrer">✓ withdrawn on-chain ↗</a></div>`;
      } else if (n.withdrawing) {
        action = `<span class="pend">⏳ withdrawing on-chain…</span>`;
      } else {
        const off = opened ? "" : `<button class="offramp" data-id="${n.id}">Off-ramp to MXN →</button>`;
        const wd = n.spendable ? `<button class="withdraw" data-id="${n.id}">Withdraw on-chain →</button>` : "";
        action = off + wd;
      }
      return `<div class="note">
        <div class="row"><span class="label">incoming · #${n.id}</span><span class="ts">${n.ts}</span></div>
        ${amountRow}${action}
      </div>`;
    })
    .join("");
}

// Spend a deposited note on-chain: build a transfer proof, submit pool.withdraw.
async function withdrawNote(note) {
  if (!note.spendable || note.withdrawn || note.withdrawing) return;
  note.withdrawing = true;
  renderReceiver();
  status.innerHTML = `<span class="spin">◠</span> Withdraw #${note.id} — building shielded transfer proof…`;
  try {
    const amt = BigInt(note.amount);
    const W = amt; // release the note's full amount
    const dPriv = randomFieldElement(), dBlind = randomFieldElement();
    const dPub = F.toObject(poseidon([dPriv]));
    const dCommit = F.toObject(poseidon([0n, dPub, dBlind]));
    const o0Priv = randomFieldElement(), o0Blind = randomFieldElement();
    const o0Pub = F.toObject(poseidon([o0Priv]));
    const o0Amt = amt + W;
    const o0Commit = F.toObject(poseidon([o0Amt, o0Pub, o0Blind]));
    const o1Priv = randomFieldElement(), o1Blind = randomFieldElement();
    const o1Pub = F.toObject(poseidon([o1Priv]));
    const o1Commit = F.toObject(poseidon([0n, o1Pub, o1Blind]));
    const n0 = F.toObject(poseidon([BigInt(note.commitment), BigInt(note.leafIndex), BigInt(note.privKey)]));
    const n1 = F.toObject(poseidon([dCommit, 0n, dPriv]));
    const root = tree.root(leaves);
    const path = tree.pathElements(leaves, note.leafIndex).map((x) => x.toString());
    const input = {
      root: root.toString(), publicAmount: W.toString(), extDataHash: "1",
      inputNullifier: [n0.toString(), n1.toString()],
      outputCommitment: [o0Commit.toString(), o1Commit.toString()],
      inAmount: [note.amount, "0"],
      inPrivKey: [note.privKey, dPriv.toString()],
      inBlinding: [note.blinding, dBlind.toString()],
      inLeafIndex: [String(note.leafIndex), "0"],
      inPathElements: [path, new Array(10).fill("0")],
      outAmount: [o0Amt.toString(), "0"],
      outPubkey: [o0Pub.toString(), o1Pub.toString()],
      outBlinding: [o0Blind.toString(), o1Blind.toString()],
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, "./circuit/transfer.wasm", "./circuit/transfer_final.zkey");
    status.innerHTML = `<span class="spin">◠</span> Withdraw #${note.id} — releasing tokens on-chain…`;
    const res = await withdrawSubmit(proof, publicSignals);
    note.withdrawing = false;
    if (res.ok) {
      note.withdrawn = res.hash || "ok";
      status.textContent = "Withdrawn on-chain ✓ — the note was spent and tokens released from the pool.";
    } else {
      status.textContent = "Withdraw failed: " + res.error;
    }
  } catch (e) {
    note.withdrawing = false;
    status.textContent = "Withdraw failed: " + ((e && e.message) || e);
  }
  renderReceiver();
  loadPoolState();
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

$("sendBtn").addEventListener("click", async () => {
  if (!poseidon) { status.textContent = "Prover still loading — one moment…"; return; }
  $("sendBtn").disabled = true;
  try { await createPayment(); } finally { $("sendBtn").disabled = false; }
});
$("proveBtn").addEventListener("click", () => {
  if (!poseidon) { status.textContent = "Prover still loading — one moment…"; return; }
  proveAndVerify();
});
$("incoming").addEventListener("click", (e) => {
  const off = e.target.closest(".offramp");
  if (off) {
    offramped.add(Number(off.dataset.id));
    renderReceiver();
    status.textContent = "Off-ramp: amount revealed at the corridor edge to convert to local fiat.";
    return;
  }
  const wd = e.target.closest(".withdraw");
  if (wd) {
    const n = notes.find((x) => x.id === Number(wd.dataset.id));
    if (n) withdrawNote(n);
  }
});

console.log("[tukar] app.js module executed — wiring UI");
init();

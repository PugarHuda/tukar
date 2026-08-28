import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@/components/landing/landing.css";
import { CircuitsTabs } from "@/components/landing/CircuitsTabs";
import { LaunchButton } from "@/components/landing/LaunchModal";
import { Wordmark, ICON_DATA_URI } from "@/components/landing/Wordmark";
import { Seal } from "@/components/ui/Seal";
import { CORRIDORS } from "@/components/receiver/corridors";
import { POOL, DISCLOSURE_VERIFIER, THRESHOLD_VERIFIER, AGGREGATE_VERIFIER, RANGE_VERIFIER } from "@/lib/constants";

const POOL_URL = `https://stellar.expert/explorer/testnet/contract/${POOL}`;
const REPO = "https://github.com/PugarHuda/tukar";

// The live corridor contracts on testnet: the pool plus its seven Groth16 verifiers, the same set
// public/.well-known/stellar.toml publishes. The additive contracts (policy registry, reserves,
// enforced pool) are not counted here. The three verifiers lib/constants does not export are the
// transfer, compliance, and merkleUpdate verifiers (ids from stellar.toml).
const LIVE_CONTRACTS = [
  POOL,
  "CACHZSWXJJAGW5UKA5KME73YV5BVYOXFKGT5KUSXIAS3JJJM4QY3PUNE", // transfer_verifier
  "CDXYGM37TRH4JXBZKVPOOEIDX5L7NUVUXJ63E5BHW2W7O4SKQMWXBCG2", // compliance_verifier
  DISCLOSURE_VERIFIER,
  "CCA3T54EKN3RJD77LRQJ2P664ZF3U4STPRQIK4IIQWPACRLXB3JS3X6H", // merkleUpdate_verifier
  THRESHOLD_VERIFIER,
  AGGREGATE_VERIFIER,
  RANGE_VERIFIER,
];
// One entry per circuits/*.circom file in the repo.
const CIRCUITS = ["transfer", "compliance", "disclosure", "merkleUpdate", "thresholdDisclosure", "aggregateDisclosure", "rangeDisclosure", "reserves"];
// `cargo test` total across the contract crates (pool 52, pool-enforced 71, pool-timelock 89,
// pool-accumulator 78, policy-registry 6, reserves 6, reserves-aggregate 12) on 2026-08-28.
// Refresh: run `cargo test` in each contracts/* crate and sum. Shown floored to tens with a "+".
const CONTRACT_TESTS = 314;
const CONTRACT_TESTS_LABEL = `${Math.floor(CONTRACT_TESTS / 10) * 10}+`;

export const metadata: Metadata = {
  metadataBase: new URL("https://tukar-six.vercel.app"),
  title: "Tukar. Send money home, sealed.",
  description:
    "Tukar is a private cross-border remittance corridor on Stellar. USDC crosses in a shielded transfer that hides amounts and counterparties (deposits and withdrawals public at the edges), proven compliant with zero-knowledge and verified on-chain by live Stellar BN254 Groth16 verifiers.",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  icons: { apple: "/icon-192.png", icon: ICON_DATA_URI },
  openGraph: {
    type: "website",
    url: "https://tukar-six.vercel.app/",
    title: "Tukar. Send money home, sealed.",
    description:
      "Private cross-border remittance corridors on Stellar. Shielded transfers hide amounts and counterparties (edges public by design), with compliance proven in ZK and verified on-chain.",
    images: [{ url: "https://tukar-six.vercel.app/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tukar. Send money home, sealed.",
    description: "Private cross-border remittance corridors on Stellar. Shielded in the middle, stamped compliant on-chain.",
    images: ["https://tukar-six.vercel.app/og-image.png"],
  },
};

export const viewport: Viewport = { themeColor: "#d4a468" };

const MARQUEE = ["Stellar", "Soroban", "Circom", "Groth16", "BN254", "Poseidon", "snarkjs", "circomlib", "zk-SNARK", "WASM", "Protocol 28"];

// The box's journey, in the order it happens on-chain. Every status is a real property of the
// deployed contracts (see the contract table in README.md and the tests behind it).
const JOURNEY = [
  { step: "Pack", what: "The sender deposits USDC with a compliance proof: the source is on the ASP allow-list and not on the deny-list, bound to this deposit.", stamp: "PROOF BOUND" },
  { step: "Seal", what: "The note becomes a commitment in the shielded Merkle tree. A trustless merkleUpdate proof advances the root on-chain; a fake root is rejected.", stamp: "SEALED" },
  { step: "Ship", what: "In transit, only nullifiers are revealed. No amount, no counterparties, no payment graph. Deposits and withdrawals stay public at the edges by design.", stamp: "PRIVATE" },
  { step: "Customs", what: "A regulator can ask for a selective disclosure: exact, at-or-below a figure, within a band, or a portfolio sum. Each is a separate proof verified on-chain and bound to the audit request.", stamp: "CLEARED" },
  { step: "Open", what: "The receiver proves ownership and withdraws. The released amount is bound to the proof, then cashes out through the anchor to local money.", stamp: "DELIVERED" },
];

const PROVES = [
  { k: "TRANSFER", q: "A spent note can never be spent twice. Its nullifier is bound to the proof.", name: "No double-spend", sub: "pool, double-spend rejected" },
  { k: "COMPLIANCE", q: "The source is on the ASP allow-list and not on the deny-list, bound to the transfer.", name: "Compliant source", sub: "compliance verifier, verify returns true" },
  { k: "DISCLOSURE", q: "This commitment opens to exactly this amount, for this auditor and no one else.", name: "Selective disclosure", sub: "disclosure verifier, tampered input rejected" },
  { k: "PRIVACY", q: "The payment graph stays hidden. The in-corridor transfer reveals no amount or counterparty.", name: "No graph leak", sub: "shielded, private by construction" },
];

export default function Home() {
  return (
    <>
      {/* ============ HEADER: the label strip along the top edge of the box ============ */}
      <header className="header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="Tukar home">
            <Wordmark height={30} />
          </Link>
          <nav className="nav" aria-label="Sections">
            <a href="#apps">Apps</a>
            <a href="#corridor">Corridor</a>
            <a href="#circuits">Circuits</a>
            <a href="#contracts">Contracts</a>
          </nav>
          <div className="header-spacer" />
          <div className="header-right">
            <a className="link" href={REPO} target="_blank" rel="noopener">GitHub</a>
            <a className="link" href={POOL_URL} target="_blank" rel="noopener">Pool contract</a>
            <LaunchButton className="btn-cta">Launch app</LaunchButton>
          </div>
        </div>
      </header>

      {/* ============ HERO: the top of one sealed box ============ */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-inner">
          <div className="box">
            <span className="tape tape-corner" aria-hidden="true" />
            <div className="label label-main">
              <div className="label-bar">
                <span>Tukar</span>
                <span>Private remittance on Stellar</span>
                <span className="label-bar-right">Testnet</span>
              </div>
              <h1 id="hero-title">
                Send money home,<br />sealed.
              </h1>
              <dl className="label-fields">
                <div><dt>From</dt><dd><span className="tk-redact" style={{ minWidth: "11ch" }} role="img" aria-label="hidden" /></dd></div>
                <div><dt>To</dt><dd><span className="tk-redact" style={{ minWidth: "9ch" }} role="img" aria-label="hidden" /></dd></div>
                <div><dt>Contents</dt><dd>USDC, amount sealed</dd></div>
                <div><dt>Route</dt><dd>Fiat in, shielded pool across, fiat out</dd></div>
              </dl>
              <p className="label-copy">
                Deposits and withdrawals are public at the edges, by design. The crossing in between is private: no amount,
                no counterparties, no payment graph. Every transfer carries a zero-knowledge compliance proof that a live Stellar
                contract verifies before the money moves.
              </p>
              <div className="stamps">
                <span className="tk-stamp stamp-big">Compliance cleared<small>proof on-chain</small></span>
                <span className="tk-stamp tk-stamp-ink stamp-small">Private in transit</span>
              </div>
            </div>
            <div className="stubs">
              <LaunchButton className="stub stub-primary">
                <span className="stub-t">Send a box home</span>
                <span className="stub-k">Sender, builds the proof on your phone</span>
              </LaunchButton>
              <a className="stub" href="/receiver">
                <span className="stub-t">Open a box</span>
                <span className="stub-k">Receiver, claim and cash out</span>
              </a>
            </div>
          </div>
          <div className="routing" aria-label="Corridors">
            <span className="routing-k">Routes</span>
            {CORRIDORS.map((c) => (
              <span key={c.code} className={"route" + (c.oracle ? " route-oracle" : "")} title={c.oracle ? `${c.country}: on-chain FX oracle` : `${c.country}: HTTP FX fallback`}>
                <b>{c.code}</b> {c.currency}
              </span>
            ))}
            <span className="routing-note">Underlined routes settle against the on-chain Reflector oracle.</span>
          </div>
          <p className="hero-foot">
            Everything on this page is live on Stellar testnet. <a href={REPO} target="_blank" rel="noopener">Read the code</a> or{" "}
            <a href={POOL_URL} target="_blank" rel="noopener">inspect the pool contract</a>.
          </p>
        </div>
      </section>

      {/* ============ APPS: four address labels ============ */}
      <section id="apps" className="sec sec-apps">
        <div className="wrap">
          <div className="sec-head">
            <h2>Four ways in. Pick a role.</h2>
            <p>One app for each side of the corridor. Consumer apps to send and receive; consoles for the operator and the regulator.</p>
          </div>
          <div className="manifest">
            <div className="manifest-bar">
              <span>Roles</span>
              <span>One line per side of the corridor</span>
              <span className="label-bar-right">4 apps</span>
            </div>
            <ul className="roles">
              <li>
                <a className="role" href="/sender">
                  <span className="role-name">Send money</span>
                  <span className="role-what">Deposit real USDC, build the compliance proof on your phone, and hand over a claim link. Mobile-first.</span>
                  <span className="role-meta">Consumer app · /sender</span>
                </a>
              </li>
              <li>
                <a className="role" href="/receiver">
                  <span className="role-name">Receive and cash out</span>
                  <span className="role-what">Claim a payment and off-ramp to local money at the edge. Built for the person collecting it.</span>
                  <span className="role-meta">Consumer app · /receiver</span>
                </a>
              </li>
              <li>
                <a className="role" href="/regulator">
                  <span className="role-name">Regulator console</span>
                  <span className="role-what">Verify selective disclosures on the live verifier, issue audit requests, run the travel rule, export reports.</span>
                  <span className="role-meta">Console · /regulator</span>
                </a>
              </li>
              <li>
                <a className="role" href="/operator">
                  <span className="role-name">Operator console</span>
                  <span className="role-what">Pool health, custody and reserves, corridor policy, the FX oracle, and monitoring for the desk.</span>
                  <span className="role-meta">Console · /operator</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ============ CORRIDOR: the manifest of one box's journey ============ */}
      <section id="corridor" className="sec sec-journey">
        <div className="wrap">
          <div className="sec-head">
            <h2>Private in the middle. Provable at the desk.</h2>
            <p>What happens to one box, in the order the contracts enforce it.</p>
          </div>
          <div className="manifest">
            <div className="manifest-bar">
              <span>Manifest</span>
              <span>Shielded pool, Stellar testnet</span>
              <span className="label-bar-right">{JOURNEY.length} steps</span>
            </div>
            <ol className="manifest-rows">
              {JOURNEY.map((j, i) => (
                <li key={j.step} className="manifest-row">
                  <span className="m-idx">{String(i + 1).padStart(2, "0")}</span>
                  <span className="m-step">{j.step}</span>
                  <span className="m-what">{j.what}</span>
                  <span className={"m-stamp tk-stamp" + (j.stamp === "PRIVATE" ? " tk-stamp-ink" : "")}>{j.stamp}</span>
                </li>
              ))}
            </ol>
            <p className="manifest-totals">
              <span>
                Totals: <b>{LIVE_CONTRACTS.length}</b> live contracts on testnet, <b>{CONTRACT_TESTS_LABEL}</b> contract tests (cargo),{" "}
                <b>{CIRCUITS.length}</b> ZK circuits, all verified on-chain.
              </span>
              <a className="tot-link" href={POOL_URL} target="_blank" rel="noopener">Inspect the pool on stellar.expert</a>
            </p>
          </div>
        </div>
      </section>

      {/* ============ TECH TAPE ============ */}
      <section className="sec-marquee" aria-label="Built with">
        <div className="marquee-mask tk-tape">
          <div className="marquee-track" id="marquee">
            {[0, 1].map((pass) => MARQUEE.map((item, i) => <span className="chip" key={`${pass}-${i}`}>{item}</span>))}
          </div>
        </div>
      </section>

      {/* ============ CIRCUITS / CONTRACTS TABS ============ */}
      <section id="circuits" className="sec sec-circuits">
        <div className="wrap">
          <div className="sec-head split">
            <div>
              <h2>{CIRCUITS.length} circuits. One corridor. Verified on-chain.</h2>
            </div>
            <div className="aside">
              <p>All Groth16 over BN254, generated client-side in the browser and verified by deployed Soroban contracts.</p>
              <a className="link-typed" href={POOL_URL} target="_blank" rel="noopener">View on-chain proof</a>
            </div>
          </div>
          <CircuitsTabs />
        </div>
      </section>

      {/* ============ WHAT THE ZK PROVES: customs declaration ============ */}
      <section className="sec sec-proves">
        <div className="wrap">
          <div className="sec-head">
            <h2>Properties, not promises.</h2>
            <p>The zero-knowledge is not decorative. It is the entire product. Without the proofs, Tukar does not exist.</p>
          </div>
          <div className="declaration">
            <div className="manifest-bar">
              <span>Declaration</span>
              <span>Each line is a property the contracts enforce</span>
            </div>
            <div className="proves-grid">
              {PROVES.map((p) => (
                <div className="prove" key={p.k}>
                  <div className="name">
                    {p.name}
                    <span className="tk-stamp stamp-xs">Proven</span>
                  </div>
                  <blockquote>{p.q}</blockquote>
                  <div className="sub">
                    {p.k.toLowerCase()} · {p.sub}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ CTA: the packing slip ============ */}
      <section className="sec sec-cta">
        <div className="wrap cta-grid">
          <div className="cta-left">
            <h2>Try it now. No install needed.</h2>
            <p>One tap activates a real built-in testnet key, or connect your own wallet. Send builds a compliance proof in your browser and deposits on-chain for real. Audit a payment and its disclosure proof is verified by the live Stellar verifier.</p>
            <dl className="facts">
              <div><dt>Live apps</dt><dd><a href="#apps">Four, one per role</a></dd></div>
              <div><dt>Repository</dt><dd><a href={REPO} target="_blank" rel="noopener">github.com/PugarHuda/tukar</a></dd></div>
              <div><dt>Network</dt><dd><a href={POOL_URL} target="_blank" rel="noopener">Stellar testnet, Protocol 28</a></dd></div>
            </dl>
          </div>
          <div className="slip">
            <div className="label-bar">
              <span>Packing slip</span>
              <span className="label-bar-right">Run the corridor</span>
            </div>
            <ol className="slip-steps">
              <li><span className="st">Send</span><span className="sd">Builds a compliance proof, submits a signed pool.deposit</span></li>
              <li><span className="st">Update tree</span><span className="sd">merkleUpdate proof registers the commitment on-chain</span></li>
              <li><span className="st">Withdraw</span><span className="sd">Shielded transfer proof spends a nullifier, releases tokens</span></li>
              <li><span className="st">Audit</span><span className="sd">Disclosure proof verified on-chain by the Stellar verifier</span></li>
            </ol>
            <LaunchButton className="stub stub-primary stub-wide">
              <span className="stub-t">Open a live app</span>
              <span className="stub-k">Pick a role, no install needed</span>
            </LaunchButton>
            <p className="disclaim">Free testnet XLM and USDC only, never real funds.</p>
          </div>
        </div>
      </section>

      {/* ============ FOOTER: the bottom flap ============ */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <Link href="/" className="brand" aria-label="Tukar home">
              <Wordmark height={27} />
            </Link>
            <p>Private cross-border remittance corridors on Stellar. Private in the middle, accountable at the edges.</p>
            <p className="footer-tag">Stellar Privacy / Real-World ZK hackathon, 5th place. APAC grand finalist.</p>
          </div>
          <div className="foot-col">
            <div className="h">Project</div>
            <div className="links">
              <a href={`${REPO}/blob/main/docs/ARCHITECTURE.md`} target="_blank" rel="noopener">Architecture</a>
              <a href={`${REPO}/blob/main/docs/ONCHAIN.md`} target="_blank" rel="noopener">On-chain</a>
              <a href={`${REPO}/blob/main/docs/TESTING.md`} target="_blank" rel="noopener">Testing</a>
              <a href="/sender">Sender app</a>
              <a href="/receiver">Receiver app</a>
              <a href="/regulator">Regulator</a>
              <a href="/operator">Operator</a>
              <a href="/verify">Verify a receipt</a>
            </div>
          </div>
          <div className="foot-col">
            <div className="h">Circuits</div>
            <div className="links">
              {CIRCUITS.map((c) => (
                <a key={c} href={`${REPO}/blob/main/circuits/${c}.circom`} target="_blank" rel="noopener">{c}</a>
              ))}
            </div>
          </div>
          <div className="foot-col">
            <div className="h">Stellar</div>
            <div className="links">
              <a href="https://stellar.expert/explorer/testnet" target="_blank" rel="noopener">Testnet explorer</a>
              <a href="https://stellar.org/soroban" target="_blank" rel="noopener">Soroban</a>
              <a href={POOL_URL} target="_blank" rel="noopener">Pool contract</a>
              <a href="/deck">Pitch deck</a>
            </div>
          </div>
        </div>
        <div className="foot-bottom">
          <div className="copy">© 2026 Tukar. Apache-2.0. Not audited, testnet only.</div>
          <div className="status"><i className="dot" aria-hidden="true" />Live on Stellar testnet</div>
          <Seal size={26} className="foot-seal" />
        </div>
      </footer>
    </>
  );
}

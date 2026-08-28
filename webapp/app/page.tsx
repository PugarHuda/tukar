import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@/components/landing/landing.css";
import { HeroCanvas } from "@/components/landing/HeroCanvas";
import { GridCanvas } from "@/components/landing/GridCanvas";
import { GlobeCanvas } from "@/components/landing/GlobeCanvas";
import { CircuitsTabs } from "@/components/landing/CircuitsTabs";
import { LaunchButton } from "@/components/landing/LaunchModal";
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
// `cargo test` total across the contract crates on 2026-08-27 (pool 52, pool-enforced 65,
// pool-timelock 78, pool-accumulator 71, policy-registry 3, reserves 6, reserves-aggregate 9).
// Refresh: run `cargo test` in each contracts/* crate and sum. Shown floored to tens with a "+"
// because the crates keep gaining tests.
const CONTRACT_TESTS = 284;
const CONTRACT_TESTS_LABEL = `${Math.floor(CONTRACT_TESTS / 10) * 10}+`;

// Metadata ported verbatim from frontend/index.html <head> (copy already cleaned).
export const metadata: Metadata = {
  metadataBase: new URL("https://tukar-six.vercel.app"),
  title: "Tukar. Confidential cross-border corridor on Stellar",
  description:
    "Tukar is a confidential cross-border payment corridor on Stellar. USDC crosses in a shielded transfer that hides amounts and counterparties (deposits/withdrawals public at the edges), proven compliant with zero-knowledge and verified on-chain by a live Stellar BN254 Groth16 verifier.",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  icons: {
    apple: "/icon-192.png",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M28 16 22 5.6 10 5.6 4 16 10 26.4 22 26.4Z' stroke='%23ff8a3d' stroke-width='2' fill='none' stroke-linejoin='round'/%3E%3Cpath d='M1 16H12M20 16H31' stroke='%23ffb070' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M16 11 21 16 16 21 11 16Z' fill='%23ff7a1a'/%3E%3Cpath d='M16 13.2 18.8 16 16 18.8 13.2 16Z' fill='%230a0705'/%3E%3C/svg%3E",
  },
  openGraph: {
    type: "website",
    url: "https://tukar-six.vercel.app/",
    title: "Tukar. Private money, across borders.",
    description:
      "Confidential cross-border payment corridors on Stellar. Shielded transfers hide amounts and counterparties (edges public by design), with compliance proven in ZK and verified on-chain.",
    images: [{ url: "https://tukar-six.vercel.app/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tukar. Private money, across borders.",
    description:
      "Confidential cross-border payment corridors on Stellar. Shielded transfers hide amounts and counterparties (edges public by design), with compliance proven in ZK.",
    images: ["https://tukar-six.vercel.app/og-image.png"],
  },
};

export const viewport: Viewport = { themeColor: "#0a0705" };

const MARK = "M28 16 22 5.6 10 5.6 4 16 10 26.4 22 26.4Z";
const MARK_LINE = "M1 16H12M20 16H31";
const MARK_DIAMOND = "M16 11 21 16 16 21 11 16Z";
const MARK_INNER = "M16 13.2 18.8 16 16 18.8 13.2 16Z";

function BrandMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d={MARK} stroke="#ff8a3d" strokeWidth="2" strokeLinejoin="round" />
      <path d={MARK_LINE} stroke="#ffb070" strokeWidth="2" strokeLinecap="round" />
      <path d={MARK_DIAMOND} fill="#ff7a1a" />
      <path d={MARK_INNER} fill="#0a0705" />
    </svg>
  );
}

const MARQUEE = ["Stellar", "Soroban", "Circom", "Groth16", "BN254", "Poseidon", "snarkjs", "circomlib", "zk-SNARK", "WASM", "Protocol 26"];

export default function Home() {
  return (
    <>
      {/* ============ HEADER ============ */}
      <header className="header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="Tukar home">
            <BrandMark size={30} />
            <span className="word">tukar</span>
          </Link>
          <nav className="nav">
            <a href="#apps">Apps</a>
            <a href="#corridor">Corridor</a>
            <a href="#circuits">Circuits</a>
            <a href="#contracts">Contracts</a>
          </nav>
          <div className="header-spacer" />
          <div className="header-right">
            <a className="link" href={REPO} target="_blank" rel="noopener">GitHub</a>
            <a className="link" href={POOL_URL} target="_blank" rel="noopener">Pool ↗</a>
            <LaunchButton className="btn-cta">Launch app ↗</LaunchButton>
          </div>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section className="hero">
        <HeroCanvas />
        <div className="hero-fade" />
        <div className="hero-inner">
          <div>
            <div className="eyebrow">Confidential corridors</div>
            <h1>
              Send money home, privately.
              <br />
              <span className="dim">Private in the middle, accountable at the edges.</span>
            </h1>
            <div className="hero-ctas">
              <LaunchButton className="btn-primary">Launch the live apps <span>↗</span></LaunchButton>
              <a className="btn-ghost" href={REPO} target="_blank" rel="noopener">View on GitHub <span>↗</span></a>
            </div>
          </div>
          <div className="hero-side">
            <p>Fiat in → shielded USDC → fiat out. The corridor crossing is private, with amounts and counterparties hidden. Deposits and withdrawals stay public at the edges, and every transfer is proven compliant with zero-knowledge.</p>
            <div className="hr-thin" />
            <div className="hero-stats">
              <span>STELLAR TESTNET</span>
              <span>{CIRCUITS.length} ZK CIRCUITS</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ APPS / ROLE PICKER ============ */}
      <section id="apps" className="sec-apps">
        <div className="wrap">
          <div className="apps-head">
            <div>
              <div className="eyebrow">Try the corridor</div>
              <h2 className="big">Four ways in.<br />Pick a role.</h2>
            </div>
            <p>Four focused apps, one for each side of the corridor. Consumer apps to send and receive, dashboards for the regulator and the operator.</p>
          </div>

          <div className="apps-grid">
            <a className="card app-card" href="/sender">
              <span className="app-kind consumer">Consumer app</span>
              <h3>Send money</h3>
              <p>Deposit real USDC, build the compliance proof on your phone, and share a claim link. Mobile-first.</p>
              <span className="app-go">Open /sender →</span>
            </a>
            <a className="card app-card" href="/receiver">
              <span className="app-kind consumer">Consumer app</span>
              <h3>Receive & cash out</h3>
              <p>Claim a payment and off-ramp to local fiat at the edge. Built for the person collecting it.</p>
              <span className="app-go">Open /receiver →</span>
            </a>
            <a className="card app-card" href="/regulator">
              <span className="app-kind dash">Dashboard</span>
              <h3>Regulator console</h3>
              <p>Verify selective disclosures on the live verifier, issue audit requests, and pull reports.</p>
              <span className="app-go">Open /regulator →</span>
            </a>
            <a className="card app-card" href="/operator">
              <span className="app-kind dash">Dashboard</span>
              <h3>Operator console</h3>
              <p>Pool health, ASP policy, the FX oracle, and corridor configuration for the desk.</p>
              <span className="app-go">Open /operator →</span>
            </a>
          </div>
        </div>
      </section>

      {/* ============ ZK FEATURE CARDS ============ */}
      <section id="corridor" className="sec-zk">
        <div className="wrap">
          <h2 className="big">Confidential by design.<br />Compliant by proof.</h2>

          <div className="zk-grid">
            {/* big left card with commitment-grid canvas */}
            <div className="card zk-big">
              <div className="zk-canvas-cell">
                <GridCanvas />
              </div>
              <div className="zk-big-body">
                <div className="tag red">Shielded ledger</div>
                <h3>Private<br />transfers</h3>
                <p>Notes enter a Merkle tree as commitments. An in-corridor transfer reveals only nullifiers, never the amount or the counterparties.</p>
                <div className="bullets">
                  <div className="bullet"><span className="dot" />No double-spend (verified on-chain)</div>
                  <div className="bullet"><span className="dot" />Balance conservation in-circuit</div>
                  <div className="bullet"><span className="dot" />Merkle inclusion, depth 10</div>
                </div>
                <div className="spacer-fill" />
                <div className="hr-card" />
                <div className="stat-row">
                  <div>
                    <div className="stat-num">{LIVE_CONTRACTS.length}</div>
                    <div className="stat-label">LIVE CONTRACTS ON TESTNET</div>
                  </div>
                  <div>
                    <div className="stat-num orange">{CONTRACT_TESTS_LABEL}</div>
                    <div className="stat-label">CONTRACT TESTS (CARGO)</div>
                  </div>
                </div>
              </div>
            </div>

            {/* right stacked */}
            <div className="zk-stack">
              <div className="card grow">
                <div className="tag">Disclosure</div>
                <h3>Selective disclosure</h3>
                <p>Selective disclosure comes in four forms, each a separate Groth16 circuit verified on-chain. A confidential commitment can open to an exact amount, to a threshold (at or below a figure, amount hidden), to an aggregate (a portfolio sum at or below a cap), or to a two-sided range (an amount within a band). Every form is bound to a specific audit request.</p>
                <div className="bullets-sm">
                  <div className="bullet"><span className="dot" />Four disclosure circuits, all verified on-chain</div>
                  <div className="bullet"><span className="dot" />Off-chain: false witness rejected</div>
                  <div className="bullet"><span className="dot" />On-chain: tampered → InvalidProof</div>
                </div>
                <div className="bar-fill">
                  <div className="bar lit" />
                  <div className="bar short" />
                </div>
              </div>
              <div className="card">
                <div className="tag">Compliance</div>
                <h3 style={{ marginBottom: 22 }}>ASP allow / deny</h3>
                <div className="asp-row">
                  <div className="asp-cell">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#37d67a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17 19 7" /></svg>
                  </div>
                  <div className="asp-cell">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8a847e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6 18 18M18 6 6 18" /></svg>
                  </div>
                  <div className="asp-cell">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#cfc8c1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12h6" /><path d="M9.5 8.5H7a3.5 3.5 0 0 0 0 7h2.5" /><path d="M14.5 8.5H17a3.5 3.5 0 0 1 0 7h-2.5" /></svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ TECH MARQUEE ============ */}
      <section className="sec-marquee">
        <div className="wrap">
          <div className="tag" style={{ marginBottom: 22 }}>Built with</div>
          <div className="marquee-mask">
            <div className="marquee-track" id="marquee">
              {/* duplicated for a seamless translateX(-50%) loop */}
              {[0, 1].map((pass) => MARQUEE.map((item, i) => <div className="chip" key={`${pass}-${i}`}>{item}</div>))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ CIRCUITS / CONTRACTS TABS ============ */}
      <section id="circuits" className="sec-circuits">
        <div className="wrap">
          <div className="split-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 18 }}>On-chain proof</div>
              <h2>{CIRCUITS.length} circuits. One corridor.<br />Verified on-chain.</h2>
            </div>
            <div className="aside">
              <a className="link-mono" href={POOL_URL} target="_blank" rel="noopener">VIEW ON-CHAIN PROOF ↗</a>
              <p>All Groth16 over BN254, generated client-side in the browser and verified by deployed Soroban contracts.</p>
            </div>
          </div>

          <CircuitsTabs />
        </div>
      </section>

      {/* ============ WHAT THE ZK PROVES ============ */}
      <section className="sec-proves">
        <div className="wrap">
          <div className="proves-head">
            <div>
              <div className="tag red" style={{ marginBottom: 16 }}>What the ZK proves</div>
              <h2>Properties, not promises.</h2>
            </div>
            <p>The zero-knowledge is not decorative. It is the entire product. Without the proofs, Tukar does not exist.</p>
          </div>
          <div className="proves-grid">
            <div className="prove">
              <div className="prove-top"><span className="k">TRANSFER</span><span className="ok">✓ PROVEN</span></div>
              <blockquote>“A spent note can never be spent twice. Its nullifier is bound to the proof.”</blockquote>
              <div className="spacer-fill" />
              <div className="hr-card" />
              <div className="name">No double-spend</div>
              <div className="sub">pool · double-spend rejected</div>
            </div>
            <div className="prove">
              <div className="prove-top"><span className="k">COMPLIANCE</span><span className="ok">✓ PROVEN</span></div>
              <blockquote>“The source is on the ASP allow-list and not on the deny-list, bound to the transfer.”</blockquote>
              <div className="spacer-fill" />
              <div className="hr-card" />
              <div className="name">Compliant source</div>
              <div className="sub">compliance verifier · verify → true</div>
            </div>
            <div className="prove">
              <div className="prove-top"><span className="k">DISCLOSURE</span><span className="ok">✓ PROVEN</span></div>
              <blockquote>“This commitment opens to exactly this amount, for this auditor and no one else.”</blockquote>
              <div className="spacer-fill" />
              <div className="hr-card" />
              <div className="name">Selective disclosure</div>
              <div className="sub">disclosure verifier · tampered → rejected</div>
            </div>
            <div className="prove">
              <div className="prove-top"><span className="k">PRIVACY</span><span className="ok">✓ PROVEN</span></div>
              <blockquote>“The payment graph stays hidden. The in-corridor transfer reveals no amount or counterparty. Deposits and withdrawals are public at the edges, by design.”</blockquote>
              <div className="spacer-fill" />
              <div className="hr-card" />
              <div className="name">No graph leak</div>
              <div className="sub">shielded · private by construction</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ GLOBE / CROSS-BORDER ============ */}
      <section className="sec-globe">
        <div className="wrap globe-grid">
          <div className="globe-canvas-wrap">
            <GlobeCanvas />
          </div>
          <div className="globe-body">
            <div className="globe-head">
              <span className="tag" style={{ color: "var(--orange)" }}>The corridor</span>
              <a className="link-mono" href="#corridor">HOW IT WORKS ↗</a>
            </div>
            <h2>Money enters in one country. Exits in another.</h2>
            <p>Stellar&apos;s whole reason for existing is moving real money across borders. Tukar takes that exact rail and makes it confidential and compliant, with visible deposits and withdrawals at the edges, a private transfer in the middle, and selective disclosure for regulators.</p>
            <div className="globe-stats">
              <div><div className="stat-num orange">A → B</div><div className="stat-label">10 CORRIDORS</div></div>
              <div><div className="stat-num">USDC</div><div className="stat-label">SHIELDED IN THE MIDDLE</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="sec-cta">
        <div className="wrap cta-grid">
          <div className="cta-left">
            <h2>Try it now.<br /><span className="orange">No install needed.</span></h2>
            <p>One click activates a real built-in testnet key (or connect Freighter). Send builds a compliance proof in your browser and deposits on-chain for real. Audit a payment and its disclosure proof is verified by the live Stellar verifier.</p>
            <div className="fact-list">
              <a className="fact" href="#apps">
                <div className="k">LIVE APPS</div>
                <div className="v">Four focused apps</div>
              </a>
              <a className="fact" href={REPO} target="_blank" rel="noopener">
                <div className="k">REPOSITORY</div>
                <div className="v orange">github.com/PugarHuda/tukar</div>
              </a>
              <a className="fact" href={POOL_URL} target="_blank" rel="noopener">
                <div className="k">NETWORK</div>
                <div className="v">Stellar testnet · Protocol 26</div>
              </a>
            </div>
          </div>
          <div className="cta-card">
            <h3>Run the corridor</h3>
            <div className="steps">
              <div className="step"><span className="num">01</span><div><div className="st">Send</div><div className="sd">Builds a compliance proof, submits a signed pool.deposit</div></div></div>
              <div className="step"><span className="num">02</span><div><div className="st">Update tree</div><div className="sd">merkleUpdate proof registers the commitment on-chain</div></div></div>
              <div className="step"><span className="num">03</span><div><div className="st">Withdraw</div><div className="sd">Shielded transfer proof spends a nullifier, releases tokens</div></div></div>
              <div className="step"><span className="num">04</span><div><div className="st">Audit</div><div className="sd">Disclosure proof verified on-chain by the Stellar verifier</div></div></div>
            </div>
            <div className="hr-card" style={{ margin: "28px 0 22px" }} />
            <LaunchButton className="btn-launch">Launch a live app ↗</LaunchButton>
            <div className="disclaim">
              <span className="box"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#37d67a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17 19 7" /></svg></span>
              Free testnet XLM only, never with real funds.
            </div>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <Link href="/" className="brand">
              <BrandMark size={27} />
              <span className="word">tukar</span>
            </Link>
            <p>Confidential cross-border payment corridors on Stellar. Private in the middle, accountable at the edges.</p>
            <div className="footer-tag">Stellar Hacks: Real-World ZK</div>
            <div className="socials">
              <a href={REPO} target="_blank" rel="noopener" aria-label="GitHub">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2A10 10 0 0 0 8.8 21.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.8-2.4 4.7-4.6 4.9.3.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" /></svg>
              </a>
              <a href={POOL_URL} target="_blank" rel="noopener" aria-label="Pool contract on Stellar.Expert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 0 1 0 10h-2" /><path d="M8 12h8" /></svg>
              </a>
            </div>
          </div>
          <div className="foot-col">
            <div className="h">PROJECT</div>
            <div className="links">
              <a href={`${REPO}/blob/main/docs/ARCHITECTURE.md`} target="_blank" rel="noopener">Architecture</a>
              <a href={`${REPO}/blob/main/docs/ONCHAIN.md`} target="_blank" rel="noopener">On-chain</a>
              <a href={`${REPO}/blob/main/docs/TESTING.md`} target="_blank" rel="noopener">Testing</a>
              <a href="/sender">Sender app</a>
              <a href="/receiver">Receiver app</a>
              <a href="/regulator">Regulator</a>
              <a href="/operator">Operator</a>
            </div>
          </div>
          <div className="foot-col">
            <div className="h">CIRCUITS</div>
            <div className="links">
              {CIRCUITS.map((c) => (
                <a key={c} href={`${REPO}/blob/main/circuits/${c}.circom`} target="_blank" rel="noopener">{c}</a>
              ))}
            </div>
          </div>
          <div className="foot-col">
            <div className="h">STELLAR</div>
            <div className="links">
              <a href="https://stellar.expert/explorer/testnet" target="_blank" rel="noopener">Testnet</a>
              <a href="https://stellar.org/soroban" target="_blank" rel="noopener">Soroban</a>
              <a href={REPO} target="_blank" rel="noopener">BN254 host fns</a>
              <a href={POOL_URL} target="_blank" rel="noopener">Pool contract</a>
            </div>
          </div>
        </div>
        <div className="foot-bottom">
          <div className="copy">© 2026 Tukar. Apache-2.0. Not audited, testnet only.</div>
          <div className="status"><span className="dot" />Live on Stellar testnet</div>
        </div>
      </footer>
    </>
  );
}

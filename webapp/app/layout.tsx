import type { Metadata } from "next";
import { Barlow, Courier_Prime, Saira_Stencil_One } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { WalletProvider } from "@/components/WalletProvider";
import { ToastProvider } from "@/components/ui";

const barlow = Barlow({ subsets: ["latin"], variable: "--font-barlow", display: "swap", weight: ["400", "500", "600", "700"] });
const stencil = Saira_Stencil_One({ subsets: ["latin"], variable: "--font-stencil", display: "swap", weight: "400" });
const courier = Courier_Prime({ subsets: ["latin"], variable: "--font-mono", display: "swap", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Tukar",
  description: "Private cross-border remittance on Stellar. The money crosses sealed; the label is stamped compliant on-chain.",
};

// Direction contract (Impeccable, seed e027abe0). Emitted as a real HTML comment, first in <body>,
// so it survives the production build and every later edit reopens it.
const CONTRACT = `
THESIS: A remittance is a sealed parcel. Nobody on the road sees what is inside; every box carries a label the customs desk can stamp. Refuses the fintech phone-mockup hero and the crypto glow.
OWN-WORLD: Kraft corrugate ground with flute shadow; white label paper for everything readable; three inks only: stencil black, tape red, stamp blue. Saira Stencil One display, Barlow labels, Courier Prime typed data. Labels, stubs with perforated edges, tape strips, rubber stamps; amounts in fixed-position tabular digits; one tape-seal glyph per view; one 420ms clock for tape, stamps, tears.
STORY: The visitor sees a box addressed home with FROM and TO blacked out and a fresh COMPLIANCE CLEARED stamp, understands that the money crosses private yet provable, and tears off the stub to send one.
FIRST VIEWPORT: The top of one sealed box fills the viewport. A large white shipping label: TUKAR stencilled, FROM/TO redacted, CONTENTS: USDC amount sealed, a blue customs stamp. Primary stub "Send a box home" on the label's right edge; second stub "Open a box". Corridor routing tape along the bottom.
FORM: The Balikbayan Parcel, candidate 3 of 7 grounded directions, seed e027abe0. Raised by: three-ink rule (kiosk), one landmark mark per view (magazine), fixed-digit amounts (nixie), one shared motion clock (cracktro).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${stencil.variable} ${courier.variable}`}>
      <body>
        <div hidden dangerouslySetInnerHTML={{ __html: `<!--${CONTRACT}-->` }} />
        {/* Rubber-stamp ink filter for .tk-stamp: noise displaces the edges so the impression bleeds
            and thins unevenly like real ink on paper. Authored SVG, no raster. */}
        <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
          <filter id="tk-ink" x="-4%" y="-8%" width="108%" height="116%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feComponentTransfer in="d">
              <feFuncA type="table" tableValues="0 0.55 0.9 1" />
            </feComponentTransfer>
          </filter>
        </svg>
        <WalletProvider>
          <ToastProvider>{children}</ToastProvider>
        </WalletProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

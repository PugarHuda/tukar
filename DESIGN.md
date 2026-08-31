---
name: Tukar
description: The Balikbayan Parcel. A remittance is a sealed kraft box; everything readable is a white label stuck to it, printed in three inks.
colors:
  kraft: "#d4a468"
  kraft-deep: "#c08e54"
  kraft-dark: "#a97a45"
  kraft-edge: "#8d6236"
  label: "#f6f1e7"
  label-2: "#efe8da"
  label-3: "#e6ddca"
  input: "#fffdf8"
  ink: "#161311"
  ink-2: "#3d3731"
  ink-3: "#5a5148"
  ink-4: "#6b6159"
  tape: "#d8342b"
  tape-deep: "#b5281f"
  tape-wash: "rgba(216,52,43,0.10)"
  stamp: "#2a4fa8"
  stamp-deep: "#17306f"
  stamp-wash: "rgba(42,79,168,0.10)"
  hair: "rgba(22,19,17,0.12)"
  line: "rgba(22,19,17,0.16)"
  rule: "rgba(22,19,17,0.25)"
  line-input: "rgba(22,19,17,0.38)"
typography:
  display:
    fontFamily: "Saira Stencil One, Barlow, system-ui, sans-serif"
    fontSize: "clamp(40px, 6.4vw, 84px)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Saira Stencil One, Barlow, system-ui, sans-serif"
    fontSize: "clamp(30px, 4.2vw, 52px)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.01em"
  title:
    fontFamily: "Saira Stencil One, Barlow, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "0.02em"
  amount:
    fontFamily: "Saira Stencil One, Barlow, system-ui, sans-serif"
    fontSize: "clamp(30px, 10vw, 40px)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.01em"
  action:
    fontFamily: "Saira Stencil One, Barlow, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "0.02em"
  lead:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  stamp:
    fontFamily: "Saira Stencil One, Barlow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.08em"
  stamp-large:
    fontFamily: "Saira Stencil One, Barlow, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.08em"
  row:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Courier Prime, ui-monospace, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.08em"
  typed:
    fontFamily: "Courier Prime, ui-monospace, Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  none: "0px"
  hair: "1px"
  tag: "2px"
  stub: "3px"
  tile: "4px"
  card: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  label: "18px"
  lg: "24px"
  pad: "28px"
  section: "clamp(56px, 8vw, 110px)"
components:
  button-primary:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.stub}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.stub}"
    padding: "10px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.label}"
  button-reveal:
    backgroundColor: "{colors.stamp}"
    textColor: "{colors.label}"
    rounded: "{rounded.stub}"
    padding: "10px 16px"
  button-reveal-hover:
    backgroundColor: "{colors.stamp-deep}"
    textColor: "{colors.label}"
  button-subtle:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink-2}"
    typography: "{typography.typed}"
    rounded: "{rounded.stub}"
    padding: "8px 14px"
  card:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  panel:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  label-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.label}"
    typography: "{typography.label}"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tile}"
    padding: "12px 14px"
  badge:
    backgroundColor: "{colors.label-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "3px 7px"
  badge-cleared:
    backgroundColor: "{colors.stamp-wash}"
    textColor: "{colors.stamp-deep}"
  badge-warning:
    backgroundColor: "{colors.tape-wash}"
    textColor: "{colors.tape-deep}"
  stamp:
    backgroundColor: "transparent"
    textColor: "{colors.stamp}"
    rounded: "{rounded.stub}"
    padding: "4px 10px 3px"
  stub:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    rounded: "{rounded.stub}"
    padding: "16px 18px 16px 28px"
  stub-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.label}"
    rounded: "{rounded.stub}"
    padding: "16px 18px 16px 28px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "12px 20px"
  nav-item-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.label}"
  toast:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px 16px"
---

# Design System: Tukar

## Overview

**Creative North Star: "The Balikbayan Parcel"**

A remittance is a sealed parcel. Nobody on the road sees what is inside; every box carries a label the customs desk can stamp. The page is the top of a kraft corrugate box (a produced 256px tile, `webapp/public/world/kraft.svg`: fractal-noise paper grain plus one flute shadow every 9px). Everything readable sits on white label paper stuck to that box: a thin ink border, an ink bar of typed captions along the top, ruled fields inside. The world is printed, not lit: three inks only (stencil black, tape red, stamp blue) on two papers (kraft, label). There is no dark mode and no scene lighting; `color-scheme: light` is declared on `:root` and the whole system is a single light look. Depth comes from paper stuck to cardboard (a hairline glue edge and a soft offset drop), never from glow.

The build is code-led and honest: every number, badge, and stamp comes from real chain state, and the world's devices carry that state. A cleared proof is a blue rubber stamp; a rejected one is the same stamp in tape red; a redacted party is a black bar on the label; the one seal per view is a short strip of drawn packing tape. Density is high on the consoles (ruled ledgers, typed captions at 11px) and calmer on the consumer surfaces (one label, one amount in stencil digits, one stub to tear off). The direction contract lives as an HTML comment at the top of `<body>` (the `CONTRACT` constant in `webapp/app/layout.tsx`, seed e027abe0).

Confirmed rejections: the fintech phone-mockup hero, the crypto glow, the previous dark orange-accent look (kept only as evidence, see the legacy aliases under Colors), emoji or font-glyph icons, and kickers or eyebrows above headings.

**Key Characteristics:**
- Kraft ground, label paper foreground, three inks. Nothing on screen belongs to a default: selection, caret, scrollbar, and focus ring are all themed from the same five values.
- Stencil caps for every heading and action word; Courier for every caption, hash, and number; Barlow for sentences.
- Stationery, not chrome: label bars, ruled fields, perforated stubs, rubber stamps, tape strips, redaction bars, a bulldog-clip clipboard for console navigation.
- One motion clock. Tape unrolls, stamps land, stubs tear, and every hover transition runs at 420ms on `cubic-bezier(0.2, 0.7, 0.2, 1)`.
- Amounts in fixed-position tabular digits (`font-variant-numeric: tabular-nums` on `body`).

## Colors

Two papers and three inks, with each ink held at two strengths plus a 10% wash.

### Primary
- **Stamp Blue** (`stamp`, #2a4fa8): the customs stamp and the accent. Cleared and verified stamps, the `reveal` button, links and their underlines, the keyboard focus ring, the caret, the `active` Panel ring, the live status dot, text selection. Deep Stamp (`stamp-deep`, #17306f) is the hover and the text-on-paper strength; Stamp Wash (`stamp-wash`, rgba(42,79,168,0.10)) is the Badge fill.

### Secondary
- **Tape Red** (`tape`, #d8342b): the FRAGILE tape and the rejection stamp. Errors, warnings, rejected verdicts, the error Toast edge, the `dash` app-kind line, the red stroke on the favicon. Deep Tape (`tape-deep`, #b5281f) is the text strength; Tape Wash (`tape-wash`, rgba(216,52,43,0.10)) is the warning Badge fill. Never used for emphasis that is not a warning.

### Neutral
- **Kraft** (`kraft`, #d4a468): the box. Page background (under the grain tile), the hero box, the launch dialog. Deep Kraft (`kraft-deep`, #c08e54) is the 10px inset flap band of the hero box; Dark Kraft (`kraft-dark`, #a97a45) is the scrollbar thumb and the clipboard clip; Kraft Edge (`kraft-edge`, #8d6236) is the box's edge border, the `scrollbar-color`, the `amber` alias, and the "pending" Badge border.
- **Label Paper** (`label`, #f6f1e7): everything readable sits on it. Cards, Panels, Sheets, stubs, the header strip, the footer flap, the sidebar. Label 2 (`label-2`, #efe8da) is the sidebar hover and the muted Badge fill; Label 3 (`label-3`, #e6ddca) is the disabled field and disabled primary button. Field paper (`input`, #fffdf8) is one step whiter for Input, Select, textarea, and `pre` blocks. Label paper is also the light module color of the claim-link and verification-link QR codes (ink modules on #f6f1e7, never black on white), and at alpha it is the skeleton's light sweep (rgba(246,241,231,0.7)) and the typed caption on the ink primary stub (rgba(246,241,231,0.78)).
- **Stencil Ink** (`ink`, #161311): all text, borders, the label bar, the active nav item, the primary stub, the redaction bar, the ink-toned stamp. Ink 2 (`ink-2`, #3d3731) is captions and secondary copy; Ink 3 (`ink-3`, #5a5148) is typed notes and units; Ink 4 (`ink-4`, #6b6159) is placeholders and disabled text. Rules are ink at alpha: 12% hairline (`hair`), 16% line, 25% ruled-field rows (`border-ink/25`), 38% field stroke (`line-input`, applied as `border-ink/45` in the components), 100% at the end of a list (`border-ink`).

### Legacy aliases
The old world's Tailwind names still compile because `webapp/tailwind.config.ts` maps them into this palette rather than deleting them: `bg` is kraft; `surface` and `surface-2` are label and label-2; `tp`, `ts`, `tm`, `tf` are ink, ink-2, ink-4, ink-3; every `orange-*` and `green-*` step is stamp or stamp-deep; `red` and `red-t` are tape and tape-deep; `amber` is kraft-edge; `line`, `line-input`, `hair` are the ink alphas above. The Badge and StatusPill `tone` values `orange` and `green` are both stamp blue for the same reason. New work uses the parcel names; the aliases exist so old class names on the consoles read correctly in the new world, not as a second palette.

### Named Rules
**The Three-Ink Rule.** Only stencil black, tape red, and stamp blue may carry meaning. Blue means cleared, verified, live, or a link; red means a warning or a rejection; black is everything else. No fourth hue, no gradient accent, no success green (green aliases to blue on purpose).

**The Label Paper Rule.** Text is never set directly on kraft. Every readable block sits on `label` paper with an ink border; kraft shows only in the gaps, through stub notches, and behind translucent tape.

**The Wash Rule.** A colored fill is at most a 10% wash of its ink (`stamp-wash`, `tape-wash`, `bg-kraft/25`). Solid color fills are reserved for the ink label bar, the ink primary stub, and the stamp-blue `reveal` button.

## Typography

**Display Font:** Saira Stencil One (with Barlow, system-ui, sans-serif), loaded via `next/font` as `--font-stencil`, weight 400 only.
**Body Font:** Barlow (with system-ui, sans-serif), `--font-barlow`, weights 400, 500, 600, 700.
**Label/Mono Font:** Courier Prime (with ui-monospace, Menlo, monospace), `--font-mono`, weights 400 and 700.

**Character:** Stencilled crate lettering for anything that names a thing or an action, a typewriter for anything the desk typed onto the label (captions, hashes, amounts in tables, provenance), and a plain sans for the sentences in between. Headings and actions are uppercase; sentences are sentence case.

### Hierarchy
- **Display** (400, `clamp(40px, 6.4vw, 84px)`, 0.95): the shipping label's h1 on the landing (`.label-main h1`), the deck wordmark (`clamp(64px, 10vw, 124px)`). Uppercase, `0.01em`. Drops to `clamp(34px, 11vw, 44px)` under 560px.
- **Headline** (400, `clamp(30px, 4.2vw, 52px)`, 1.0): section h2 on the landing (`.sec-head h2`), the console page titles, the sender and receiver h1 (`text-[clamp(30px,5vw,44px)]` class of size). Uppercase.
- **Title** (400, 24px, 1.05): stencil sub-heads: manifest steps, role names, deck card h3, `.stub-t` at 22px, app-card h3 at 26px, Sheet header at 19px, sidebar nav items at 17px, Expander rows at 15px, Button primary at 15px. All uppercase with `0.02em` to `0.06em`.
- **Amount** (400, `clamp(30px, 10vw, 40px)`, 1.0, `tabular-nums`): money in stencil digits (`AMOUNT` in `PaymentCard.tsx`, the "You send" figure on the sender). The only stencil use that is not uppercase text.
- **Body** (400, 15px, 1.5): Barlow sentences on labels: `.m-what`, `.role-what`, `.app-card p` at 14.5px, `.label-copy` and `.sec-head p` at 16px and 17px, the deck at 17px. Secondary copy at 13.5px and 12.5px in `ink-2`. Max measure 60ch to 72ch.
- **Label** (700, 11px, 1.5, `0.08em`, uppercase): typed captions in Courier: `CAP`, `captionCls`, the Input and Select label, `dt` in ruled fields, Badge text at 10.5px, `.stub-k` at 10.5px with `0.12em`.
- **Typed** (400, 12.5px, 1.6): Courier for hashes, notes, provenance, `pre` blocks (11.5px), footer meta, the `subtle` button, the manifest totals at 14px, ledger cells at 13px, large printed values (`Field` in `desk.tsx`) at 19px.

More steps sit between those: **Lead** (Barlow, 17px) for the one opening paragraph of a surface
(the hero label copy, section intros, the sender and receiver leads); **Action** (stencil, 22px) for
the words on tear-off stubs and primary buttons; **Row** (Barlow, 14px) for ledger and manifest rows,
form captions, and card copy; **Small** (Barlow, 13.5px) for footnotes and typed-caption sentences.
Stamps have their own two sizes: **Stamp** (stencil, 13px) and **Stamp large** (18px, the hero's
COMPLIANCE CLEARED and the receipt's landing stamp); `.stamp-xs` at 10.5px is the row-end status
stamp. Nothing else is set below Small except the 11px Label and 12.5px Typed steps. Display clamps
floor at 34px on a phone.

### Named Rules
**The Stencil Names It Rule.** Saira Stencil One appears only on headings, action words, stamp text, nav items, and amounts. It is never set below 15px and never used for a sentence.

**The Courier Carries Data Rule.** Every hash, contract id, count, rate, timestamp, caption, and provenance line is Courier Prime. If Barlow is showing a number the reader must compare, it is wrong.

**The No-Kicker Rule.** Headings stand alone. The typed kind or category line sits under or beside the heading (`.app-kind` uses `order: 2`), never above it as an eyebrow. `.tk-eyebrow` survives in `globals.css` only for old callers and is not to be added to new surfaces.

## Layout

One content column of `1240px` (`--wrap`, `max-w-wrap`) with `28px` side padding (`--pad`), dropping to `18px` under 900px. Sections on the landing are separated by `clamp(56px, 8vw, 110px)` of kraft; there are no section backgrounds, the label sheets themselves are the sections. The hero is a two-column box (`minmax(0,1fr) 300px`, 28px gap) with a centre seam drawn at 50%; it collapses to one column under 900px.

Inside a label the rhythm is the label margin: `18px` from the sheet edge to content (`.label-fields`, `.manifest-rows`, `.stubs`, `.slip .stub`), and `16px` (`p-4`) or `24px` (`p-6`) inside Cards and Panels. Field rows are `9px` to `10px` vertical padding with a 25% ink rule between them and a full ink rule closing the list. Everything is a grid with a `ch`-measured first column (`9ch` captions, `12ch` steps, `16ch` role names, `3ch` indices) so typed captions align like a form.

Consoles (`DashboardShell`) are a fixed `264px` clipboard rail on the left with the kraft desk scrolling independently on the right at `lg` and up; below `lg` the rail becomes a sticky label strip along the top with a hamburger opening the same Sidebar as a focus-trapped drawer (`max-w-[88vw]`). The public verify page is a single `max-w-2xl` sheet. The sender is a two-column box (label column plus a cost-and-policy column) that stacks on mobile. The receiver is a single `520px` column (`max-w-[520px]`, `px-4`) laid out as a flex column at least one viewport tall; its last child is the status strip, in the flow, so nothing is fixed or sticky on that page.

Breakpoints actually used: 560px, 900px, 1100px in `landing.css`; 600px in `deck.html`; Tailwind `sm` (640px) and `lg` (1024px) in the app. Print (`@media print`) shows only the `.tk-print` panel, black on white (#000 text, #fff paper, #bbb rules), with all animation, transform, and shadow removed. Those three print literals, and the `theme(fontFamily.*)` references in `globals.css`, are recorded detector exceptions in `.impeccable/config.json`, not palette tokens.

## Elevation & Depth

Paper stuck to cardboard. Depth is a hairline of glue shadow plus one soft, offset drop; nothing glows and nothing floats far. Kraft itself has depth from the produced grain tile and, on the hero box, an inset flap band (`inset 0 0 0 10px #c08e54, inset 0 0 0 12px rgba(22,19,17,0.25)`). Ink borders do most of the separation work; shadows only confirm that a sheet is a separate piece of paper.

### Shadow Vocabulary
- **card** (`box-shadow: 0 1px 0 rgba(22,19,17,0.10), 0 8px 18px -8px rgba(22,19,17,0.45)`): every label at rest (Card, Panel, Sheet, Toast host).
- **lift** (`box-shadow: 0 2px 0 rgba(22,19,17,0.10), 0 18px 34px -14px rgba(22,19,17,0.55)`): hover on a `hover` Card, Toasts, the mobile drawer, the landing `.label` and `.slip`.
- **ring** (`box-shadow: 0 0 0 2px #2a4fa8, 0 8px 18px -8px rgba(22,19,17,0.45)`): the `active` Panel, a stamp-blue outline around the sheet being worked on.
- **btn / btn-hover** (`0 1px 0 rgba(22,19,17,0.18)` / `0 3px 0 rgba(22,19,17,0.18)`): a stub's edge lifting one pixel on hover.
- **inset** (`inset 0 1px 2px rgba(22,19,17,0.14)`): the pressed field paper of Input, Select, textarea.
- **stub** (`0 2px 0 rgba(22,19,17,0.14), 0 14px 26px -18px rgba(22,19,17,0.6)`): the landing tear-off stubs and app cards.

### Named Rules
**The Glue-Edge Rule.** Every sheet shadow has a 1px to 2px zero-blur ink line first, then a soft drop with a negative spread. No blur-only shadows, no colored shadows, no glow.

**The Ink Line First Rule.** If an element needs separating, give it an ink border before a shadow. Shadows are reserved for whole sheets, stubs, and stamps; rows, fields, and tags get rules only.

## Shapes

Cut paper and a rubber stamp. Corners are nearly square: 3px on stubs, stamps, and landing sheets (`rounded-stub`), 4px on fields and tiles, 6px on Cards and Panels (`rounded-card`, `rounded-panel`), 2px on Badges and the label bar's top, 1px on the redaction bar. Borders are ink, 1px to 2px, with 1.5px the landing's default; the strongest edges (header, footer, hero box) are 2px.

Recurring silhouettes, all drawn in CSS or hand-authored SVG:
- **The perforated edge.** Primary buttons carry `.tk-perf` (a 2px dashed ink rule on the left); landing stubs go further with real punched notches (`mask: radial-gradient(5px at 0 50%, transparent 97%, #000) 0 0 / 100% 18px repeat-y`) and a dashed tear line 14px in. Attached slips separate with a 2px dashed top rule (`SLIP`).
- **The tape strip.** One produced asset, `webapp/public/world/tape.svg` (a 400x40 hand-authored strip: translucent amber gradient body, fractal-noise fibre streaks, a pale sheen band, both ends torn), stretched to the strip with `center / 100% 100% no-repeat`. In the app (`.tk-tape` at 28px, the landing `.tape` at 36px) it sits on `mix-blend-mode: multiply` so kraft, label, and ink rules show through, with `transform-origin: left center` so it unrolls. Rotated at the call site (`-0.6deg` on a Sheet, `-24deg` across the hero corner via `.tape-corner`, `1.5deg` each way when the receiver's two tape halves are cut). On the deck the same asset is `.hero .sheet::before`, a 62px strip (44px at or under 600px) inside the sheet crossing the black bar and the paper, normal blending at 90% opacity, rotated `-7deg`. `.tk-tape-fragile` is the red and white 45-degree stripe.
- **The rubber stamp.** `.tk-stamp`: a 2px border plus a 1px outline 2px out, stencil caps at 13px, rotated -4deg, `mix-blend-mode: multiply`, and the `#tk-ink` SVG filter from `layout.tsx` (fractal-noise displacement so the impression bleeds and thins unevenly). Three inks via `.tk-stamp-red` and `.tk-stamp-ink`; larger and smaller sizes via `.stamp-big`, `.stamp-small`, `.stamp-xs` or the `Stamp` component's `size`.
- **The redaction bar.** `.tk-redact`: a 0.95em ink bar with a 1px radius, used for FROM and TO.
- **The slight tilt.** Sheets are rotated by fractions of a degree (`-0.6deg` on the hero label, `0.5deg` on the packing slip, alternating `0.4deg` on app cards); hover straightens or nudges them along the same clock.
- **One-stroke marks.** Arrows, checks, crosses, chevrons, plus and minus are 14px SVG paths at `stroke-width: 1.8` in `currentColor` (`Mark` in `Label.tsx`, `selectChevron`, the verify page `Mark`). No icon font, no emoji.

## Components

### Buttons
The parcel's controls: a stub to tear, an outline on paper, a stamp-blue coupon, a typed tag. All share `rounded-stub` (3px), the 420ms clock on transform, shadow, and colors, and `active:translate-y-px`.
- **Primary** (`variant="primary"`): label paper, ink border, `.tk-perf` perforation on the left, Saira Stencil One 15px uppercase at `0.06em`, `px-5 py-3`, `shadow-btn`. Hover: white paper, `shadow-btn-hover`, lifts 1px. Disabled: `label-3` paper, `ink-4` text, 30% ink border, no shadow.
- **Ghost** (`variant="ghost"`): transparent, ink border, ink text at 13px, `px-4 py-2.5`. Hover inverts to ink fill with label text.
- **Reveal** (`variant="reveal"`): stamp blue fill, `stamp-deep` border, label text, 13px bold, `shadow-btn`. Hover: `stamp-deep`, lifts 1px. Disabled: 20% ink fill. Used for the money moments (reveal an amount, confirm a claim).
- **Subtle** (`variant="subtle"`): label paper, 35% ink border, `ink-2` Courier at 12px, `px-3.5 py-2`. Hover: full ink border and text.
- **Busy**: a 12px ink ring with one open segment spins on the left (`animate-tk-spin`), the button dims to 80%.
- **Landing stubs** (`.stub`, `.stub-primary`): the same idea at hero scale, with punched notches, a stencil 22px title and a typed 10.5px caption. `.stub-primary` is ink with label text (its typed caption dimmed to rgba(246,241,231,0.78)) and turns stamp blue on hover; hover slides 4px right with a -0.6deg tilt (the tear). `.btn-cta` in the header is the compact ink version.

### Badges and status
- **Badge**: a typed tag, Courier 10.5px bold uppercase at `0.06em`, `rounded-[2px]`, 1px border, `px-[7px] py-[3px]`. Tones: `muted` (label-2 paper, 35% ink border), `green` and `orange` (both stamp wash, stamp border, `stamp-deep` text: cleared or live), `red` (tape wash, tape border, `tape-deep` text), `amber` (kraft at 30%, kraft-edge border: pending).
- **StatusPill**: Courier 12px `ink-2` text with an 8px square (not round) dot that breathes on `tk-pulse` (2.4s). Dot color follows the tone: stamp, tape, kraft-edge, or ink-4.
- **Status strip** (receiver): a label strip along the bottom edge of the box, rendered in the flow as the page's last child (no fixed or sticky positioning, so it never overlays anything). A 2px ink top rule on label paper, `mt-4`, contents aligned to the 520px content column (`max-w-[520px]`, `px-4 py-3`), 13px Barlow in ink, a Spinner in place of the text while busy, and the view's 16px Seal on the right. It is the `role="status"` `aria-live="polite"` region, so changes are announced wherever the reader is.

### Cards / Containers
- **Card**: `.tk-surface` (label paper with a faint top highlight), 25% ink border, 6px radius, `shadow-card`, enters on `tk-pop`. `hover` lifts 2px to `shadow-lift`.
- **Panel**: the console sheet: same paper, `p-6`, `shadow-card` or `shadow-ring` when `active`; an optional `seq` index ("01") in a small ink-bordered Courier box at the top right.
- **Label** (`components/sender/Label.tsx`) and **Sheet** (`components/regulator/desk.tsx`): a Card whose first row is the ink label bar (`BAR`: ink fill, label text, Courier 11px semibold uppercase at `0.08em`, `px-4 py-2`, meta pushed to the right with `ml-auto`). Sheet's bar carries a stencil 19px h2 instead; `tape` adds a `.tk-tape` strip across the top edge that unrolls on mount.
- **Field rows**: a `dl` grid, `9ch` Courier caption plus value, `py-2.5`, 25% ink rule beneath, no rule on the last (`Field` in `Label.tsx`); the desk's `Field` stacks caption over a 19px Courier value with a unit in `ink-3`.
- **Ledger**: a table with an ink header row (Courier 11px uppercase) and 25% ink rules between rows, scrolling inside its own `overflow-x-auto` frame with a 40% ink border.
- **NOTICE**: a pending or attention note on kraft (`bg-kraft/25`, `kraft-edge` border, 12.5px `ink-2`). Never an error; errors are `tape-deep` text.
- **QR codes**: the claim-link QR on the sender receipt and the verification-link QR on a payment card are drawn as SVG in the world's inks, dark modules `#161311` on label paper `#f6f1e7`, not black on white.

### Inputs / Fields
- **Style**: field paper (`#fffdf8`), 45% ink border, 4px radius, `shadow-inset`, `px-3.5 py-3`, 14px Barlow (`Input`) or 13px (`Select`) or Courier 12.5px (`fieldCls` on the desk), placeholder in `ink-4`. Caption above: Courier 11px bold uppercase at `0.08em` in `ink-2`, `mt-1.5` gap.
- **Hover**: border to full ink.
- **Focus**: border to stamp blue plus `0 0 0 3px rgba(42,79,168,0.18)` on top of the inset; native outline suppressed. Keyboard-only focus everywhere else is `outline: 2px solid #2a4fa8` at 2px offset (`:focus-visible` only).
- **Select**: `appearance: none` with a drawn ink chevron (`selectChevron`, 12x8 SVG, stroke 1.8) at `right 12px center`, `pr-[34px]`.
- **Disabled**: `label-3` paper, `ink-4` text.

### Navigation
- **Landing header** (`.header`): a sticky label strip, label paper, 2px ink bottom rule, soft drop. Nav links are Barlow 600 13px uppercase at `0.04em`, 3px radius, and invert to ink on hover. Typed Courier links (GitHub, Pool contract) sit right with an ink `.btn-cta`. Nav and typed links hide under 900px.
- **Console clipboard** (`Sidebar`): label paper under a drawn bulldog clip (`Clip`, kraft-dark with an ink stroke), the Wordmark, a Courier 11px console title. Nav items are a `3ch` Courier index plus a 17px stencil name, 20% ink rule between; the active item inverts to ink with label text (`aria-current="page"`), hover is `label-2`. "Back to home" and the WalletBar pin to the bottom above 1.5px ink rules.
- **WalletBar** (console rail, sender and receiver headers): a Courier 12px line of wallet name and `stamp-deep` short address beside a ghost Disconnect button. Disconnect renders where the connect action just was, so it stays `disabled` for the first 600ms after connecting; an accidental double-tap cannot undo a connection, a deliberate click a moment later works. This is an interaction guard, not motion, and is the only timing in the app outside the 420ms clock.
- **Consumer header** (sender, receiver): a ghost "Home" stub, the Wordmark, and a Courier route tag.
- **Tabs** (`.tab`, receiver tabs): stencil 15px uppercase, transparent until selected, then ink fill with label text and an ink border joining a 1.5px ink baseline rule.
- **Deck chrome** (`#chrome`): a small label strip at the bottom centre with 32px ink-bordered buttons and 8px square dots; the current dot is stamp blue at 1.3x.

### Toasts
A label slip at the bottom right: label paper, 2px border in the tone's ink (ink for info, stamp for success, tape for error), 6px radius, `shadow-lift`, 13px Barlow medium, enters on `tk-pop`, gone after 4.2s. `aria-live="polite"` region.

### Loading
- **Spinner**: a 14px ink ring with one open segment, `tk-spin` 0.9s, beside a Courier 12px label.
- **Skeleton**: `.tk-skeleton`, 8% ink paper with a label-paper light sweep (`linear-gradient(90deg, transparent, rgba(246,241,231,0.7), transparent)` on `tk-shimmer`, 1.5s), sized to the final content so the label does not jump.

### Seal (signature)
`components/ui/Seal.tsx`: a 56x28 SVG strip of packing tape with one folded corner, kraft fill (`#b8834a` at 85%, fold `#8d6236`) with a 1.5px ink stroke and two pale creases. It is the landmark mark and appears exactly once per rendered view, where the eye lands last: the footer bottom-right on the landing, the sheet foot on verify, the right end of the in-flow status strip that closes the receiver page, the corner of the current screen on the sender (each screen branch renders its own), the console foot on operator and regulator. It has `role="img"` and a title; it is never an emoji or a glyph.

### Stamp (signature)
`.tk-stamp` and the `Stamp` component: the verdict device. Blue for cleared, verified, delivered; red for rejected or fragile; ink for neutral facts ("Private in transit", "Admin key offline", "Not attested"). `land` (or `.stamp-big`) plays `tk-ring`: scale 1.5 and -9deg to 0.96 and -4deg to rest, 420ms, with a 240ms delay on the landing so the tape has unrolled first. A `sub` line beneath is Courier 10px at `0.08em` to `0.1em`.

### Wordmark (brand)
`components/landing/Wordmark.tsx`: a 108x30 label box with TUKAR in the stencil face and a corner of packing tape crossing the top-right edge, drawn in SVG: a 50% amber shape (`#b07a40`), two pale fibre streaks (`#fff3dd` at 50%), and a torn inner edge, on `mix-blend-mode: multiply` so the label edge shows through it. The favicon (`ICON_DATA_URI`) is the box outline with a stencilled T and a red tape stroke. These are the only brand assets besides `og-image.png` (rendered from hand-authored HTML in this world by `scripts/render-og.mjs`; the PNG carries an `impeccable:prompt` tEXt chunk stating so) and the demo video.

## Do's and Don'ts

### Do:
- **Do** put every readable block on label paper (#f6f1e7) with an ink border; let kraft show only between sheets, through notches, and behind tape.
- **Do** use exactly three inks for meaning: stamp blue (#2a4fa8) for cleared, live, and links; tape red (#d8342b) for warnings and rejections; ink (#161311) for everything else.
- **Do** set every heading and action word in Saira Stencil One uppercase, every caption, hash, and comparable number in Courier Prime, every sentence in Barlow.
- **Do** run every transition and authored motion on the one clock: 420ms, `cubic-bezier(0.2, 0.7, 0.2, 1)` (`duration-clock ease-clock`, `--tk-clock`, `--tk-ease`), and honor `prefers-reduced-motion` (already global).
- **Do** render one Seal per view, at the end of the sheet, and nowhere else.
- **Do** keep amounts in tabular stencil digits and hashes in Courier, sized to the final content so the layout does not jump when chain data arrives.
- **Do** draw icons as one-stroke 14px SVG paths in `currentColor`, stroke 1.8.
- **Do** start a sheet's shadow with a 1px to 2px zero-blur ink line, then a soft negative-spread drop; keep the stamp-blue ring (`shadow-ring`) for the active Panel only.
- **Do** keep the stationery honest: a stamp, a badge, or a status dot reflects real on-chain or integration state; "not configured" and "not attested" are stamped in ink, not hidden.
- **Do** reach for the parcel token names (`kraft`, `label`, `ink`, `tape`, `stamp`) in new work; the legacy names (`bg`, `surface`, `tp`, `orange`, `green`) are aliases that still compile but say nothing about the world.

### Don't:
- **Don't** add a kicker, eyebrow, or category line above a heading; a typed kind goes under or beside it. Do not use `.tk-eyebrow` on new surfaces.
- **Don't** introduce a fourth hue, a gradient accent, a success green, a glow, or a colored shadow; there is no dark mode and no scene lighting in this world.
- **Don't** set text directly on kraft, and do not use kraft as a card background; kraft is the box, not a surface.
- **Don't** use emoji, icon fonts, or font glyphs for marks, stamps, or the seal; and do not render the Seal more than once in a view.
- **Don't** use rounded corners above 6px, pill shapes, or borderless floating cards; the world is cut paper with ink edges.
- **Don't** use Saira Stencil One below 15px or for running text, and do not set numbers the reader compares in Barlow.
- **Don't** use tape red for emphasis, highlights, or primary actions; red is a warning or a rejection.
- **Don't** invent a second motion duration or easing; scale the shared clock's keyframes (`tk-tape`, `tk-ring`, `tk-tear`, `tk-pop`) instead.
- **Don't** put boxes inside boxes on a label: separate rows and cells with hairline ink rules or a dashed slip rule, not nested bordered cards.

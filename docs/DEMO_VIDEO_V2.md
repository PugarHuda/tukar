# Tukar demo video, second cut

The shot list for the current demo video. Twenty scenes in five acts, 3 minutes 10 seconds as
rendered. Nothing in it is staged: Playwright drives the deployed app, makes a real testnet
deposit, claims the note, reads the live Reflector quote, withdraws on-chain, generates real
disclosure proofs and verifies them against the live Stellar verifier contract. Remotion lays
those recordings into the parcel world from [`DESIGN.md`](../DESIGN.md) and burns the captions.

The first cut is archived at `video/script.v1.json` for comparison. Its fourteen scenes packed
the whole regulator console into one shot and the whole operator console into another. This cut
splits those into seven scenes, so the audit-request binding, the Travel Rule leg, the export
pack, reserves, policy, the oracle and monitoring each get their own beat and their own caption.

## One source of truth

`video/script.json` holds every scene. Each stage reads it and nothing else:

| Stage | Command | What it does with the script |
|---|---|---|
| Narration | `npm run vo` | Speaks each scene's `vo` with edge-tts into `public/vo/<id>.mp3` and measures it |
| Capture | `npm run capture -- <url>` | Drives the real app and writes `captures/<source>.webm` plus a start and end mark per scene id |
| Prep | `npm run prep` | Transcodes the captures to constant frame rate and rescales the marks |
| Render | `npm run render` | Remotion sizes each scene to its narration, speeds up any clip that ran long, and prints the multiplier |
| Ship | `npm run ship` | Second compression pass into `webapp/public/demo-id.mp4` |

`npm run all` runs the five in order. It needs Chrome at the path in `capture.mjs`, `ffmpeg` and
`ffprobe` on PATH, and Python with `edge-tts` and `imageio-ffmpeg`.

The scene length rule has not changed: a scene lasts as long as its narration, and where the app
genuinely made us wait, the clip is sped up and the label bar says by how much rather than
implying the work was instant.

## Two cuts, one capture

`video/cuts/` holds the cuts and `node cut.mjs <name>` moves one into `script.json`. Both cuts
use the same scene ids, so they share one capture run and one set of narration clips. Switching
cuts costs a render and nothing else.

| Cut | Scenes | Runtime | What it is for |
|---|---:|---:|---|
| `full` | 20 | 3:10 rendered | The whole story, including the consoles and the evidence tour |
| `livedemo` | 11 | 1:45 rendered | The live demo on its own: send, arrive, prove, close |

```
npm run cut            # list the cuts and show which one is loaded
npm run cut livedemo   # swap it in
npm run render:live    # renders out/tukar-livedemo.mp4
npm run ship:live      # compresses it into webapp/public/demo-live.mp4
npm run live           # swap, render, ship, swap back to full
```

The live cut is scenes n01 to n10 plus a close written for it, so it ends on the payment rather
than on the desk. Capture always runs against the full cut, because that run is what records a
mark for every scene; the live cut re-uses those marks.

## The list

Three shot sizes, matching how the product is actually used. `desk1` is the landing at 1600x900,
`phone` is the sender and receiver at 430x932, `desk2` is the regulator, operator and verify
consoles at 1600x900. The seconds are the narration estimate at 165 words per minute.

### Act 01 · The corridor

| Scene | Shot | Label bar | What Playwright does | Est. |
|---|---|---|---|---:|
| n01 | desk1 | Landing / tukar.app | Loads the landing and settles on the hero | 8.7s |
| n02 | phone | Sender / compose | Connects the built-in testnet key, picks the Mexico corridor, enters 200 | 8.7s |
| n03 | phone | Sender / proving on the device | Presses send and waits out the real in-browser compliance proof | 10.5s |
| n04 | phone | Sender / sent and shielded | Real USDC deposit lands, the note is registered, the bearer claim note appears | 9.1s |

### Act 02 · Arrival

| Scene | Shot | Label bar | What Playwright does | Est. |
|---|---|---|---|---:|
| n05 | phone | Receiver / claim | Pastes the bearer note into the receiver app and claims it | 5.5s |
| n06 | phone | Receiver / on-chain FX | Opens the quote and waits for the live Reflector read | 8.0s |
| n07 | phone | Receiver / cash out | Runs the withdraw and waits for the on-chain settlement | 8.4s |
| n08 | phone | Receiver / selective disclosure | Generates a disclosure proof on the device | 9.1s |

### Act 03 · Proof you can check

| Scene | Shot | Label bar | What Playwright does | Est. |
|---|---|---|---|---:|
| n09 | desk2 | Regulator / verify | Pastes the genuine receipt and re-verifies in the browser and on-chain | 7.6s |
| n10 | desk2 | Regulator / tampered receipt | Bumps one character of a public signal and re-verifies, showing the rejection | 9.1s |
| n11 | desk2 | Regulator / view-only note | Recomputes the commitment from the view-only note | 6.9s |
| n12 | desk2 | Regulator / audit request | Ticks two leaves, draws a nonce, registers the request hash on-chain | 16.7s |
| n13 | desk2 | Regulator / Travel Rule | Sends a real TRP 3.2.1 message, then scrolls to the TRISA not-deployed stamp | 9.5s |
| n14 | desk2 | Regulator / compliance export | Waits for the pool events, then switches the export preset to EU TFR | 6.9s |

### Act 04 · Run the desk

| Scene | Shot | Label bar | What Playwright does | Est. |
|---|---|---|---|---:|
| n15 | desk2 | Operator / reserves and inventory | Glides through the reserves attestation and the deployed contract inventory | 7.6s |
| n16 | desk2 | Operator / policy and oracle | Opens the per-corridor policy registry, then the live oracle health card | 8.0s |
| n17 | desk2 | Operator / monitoring | Opens monitoring and waits for the real event read | 9.1s |

### Act 05 · Check it yourself

| Scene | Shot | Label bar | What Playwright does | Est. |
|---|---|---|---|---:|
| n18 | desk2 | Public verify / no wallet | Opens the verification link and waits for the verdict, with no wallet connected | 5.8s |
| n19 | desk2 | Evidence / docs and source | Opens the documentation site and scrolls the index | 6.9s |
| n20 | desk2 | Close | Returns to the landing and rests on the call to action | 9.5s |

Measured narration is 2 minutes 41 seconds across the twenty clips. With the title card, five act
cards, the end card and a beat of quiet after each line, the render is 3 minutes 10 seconds, which
is 5,695 frames at 30 fps.

**If a three-minute limit applies**, drop n11 and n19 from `script.json`. Their capture marks stay
in place and are simply unused, so nothing else has to change, and the cut lands near 2 minutes 55
seconds.

## Features this cut does not visit

The capture walks one payment end to end and then the two consoles, so a few shipped features
never appear on camera. They are in the app and in the deck, and they are listed here so the
video is not mistaken for the whole product surface.

| Feature | Where it lives |
|---|---|
| Circle CCTP V2 bridging, USDC in and out | sender app, `api/cctp/*` |
| Passkey smart wallets | `docs/PASSKEY.md`, sender app |
| Recurring sends and the scheduler, signed in with SEP-53 | `api/schedules/*`, `api/cron/recurring` |
| Web Push alerts out of the operator console | `api/push/*` |
| Reclaim proof of personhood and the idOS credential path | `api/reclaim/*`, `api/idos/credential` |
| SEP-7 payment links, PIN-wrapped claim links, QR | `api/sep7`, receiver app |
| The admin timelock's propose, delay and execute views | operator console, `pool-timelock` |
| The deny-list path through the compliance circuit | sender app, pool policy |

Adding any of them is a new scene plus a new driver in `capture.mjs`. Nothing in the pipeline
stops that; it was left out to keep the cut near three minutes.

## What this cut says, and what it refuses to say

Every claim in the narration is one the recording shows on screen.

- The sped-up scenes carry their real duration in the label bar. n03 is the clearest case, since
  in-browser proving really does take about thirty seconds.
- n12 states the limit next to the claim. An answer is bound to the set of commitments the
  auditor registered, so a payment in that set cannot be dropped. That set is built from
  deposits, which are already public, so this is not completeness over one person's cash-outs
  across addresses.
- n13 lets the app say the TRISA node is not deployed rather than talking over it.
- n17 keeps monitoring's own admissions on screen: a daily cadence, and alert thresholds
  deliberately unset because there is no traffic to baseline against.
- n20 says there are no users. That line stays in every cut.

Deliberately absent: mainnet, any licensed anchor, and the shielded monthly ledger from the
Instaward statement of work, which is proposed work and does not exist in the app. A demo video
shows what runs.

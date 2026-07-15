# Natural neural VO (edge-tts) for the DECK half of the full video — one line per
# slide of frontend/deck.html. Writes build-video/dv<i>.mp3 + build-video/deckvo.json.
# Same voice/rate as make-vo.py so the deck and live-demo halves sound like one video.
import asyncio, subprocess, json, os, re
import edge_tts
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
VOICE = "en-US-AriaNeural"
RATE = "+6%"
OUT = "build-video"
os.makedirs(OUT, exist_ok=True)

# One line per deck slide (10). Conversational — this is the "explanation" half;
# the live-demo half (make-vo.py) then shows it actually running.
LINES = [
    "This is Tukar — private cross-border remittance corridors on Stellar. USDC in, a shielded transfer, local fiat out.",
    "Stellar exists to move real money across borders. But a public ledger exposes every payment's amount and both counterparties — leaking who pays whom, how much, how often.",
    "So Tukar makes it private in the middle and accountable at the edges. Money enters, crosses hidden, exits as local fiat — and at any point a holder can prove one fact to a regulator.",
    "Four zero-knowledge circuits do the real work: the shielded transfer, a compliance check, selective disclosure, and a trustless tree update. Take them out and the product doesn't exist.",
    "It genuinely runs on Stellar. Five Soroban contracts are live on testnet — a pool holding real USDC, plus four on-chain verifiers using Stellar's native BN254 host functions.",
    "The ecosystem integration is real, not decorative. The pool reads the Reflector oracle on-chain, and refuses to release funds below a live floor. The anchor protocols are live too.",
    "And it's real money, not a mock. Real USDC custody, amounts bound to commitments, a fully trustless tree, and a real Powers-of-Tau trusted setup.",
    "All of it is verified, not asserted: thirty-six contract tests, eleven live click-through tests, and a double-spend that gets rejected on-chain.",
    "We're honest about scope, too. This is hackathon-grade and hardened on testnet, but it isn't professionally audited — so don't use it with real assets.",
    "Real-world money, made private, kept compliant — on Stellar. Now let's watch it actually run, live.",
]

def dur_ms(f):
    r = subprocess.run([FFMPEG, "-i", f], capture_output=True, text=True)
    h, mn, s = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr).groups()
    return int((int(h) * 3600 + int(mn) * 60 + float(s)) * 1000)

async def main():
    meta = []
    for i, t in enumerate(LINES):
        f = f"{OUT}/dv{i}.mp3"
        await edge_tts.Communicate(t, VOICE, rate=RATE).save(f)
        ms = dur_ms(f)
        meta.append({"i": i, "file": f, "ms": ms, "text": t})
        print(f"  dv{i}: {ms:5d} ms  \"{t[:50]}...\"")
    json.dump(meta, open(f"{OUT}/deckvo.json", "w"))
    print(f"\n{len(meta)} slides, ~{sum(m['ms'] for m in meta)/1000:.0f}s of deck VO -> {OUT}/deckvo.json")

asyncio.run(main())

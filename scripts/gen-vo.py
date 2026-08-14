# Generate one natural neural-VO clip per caption line (edge-tts, free, no key),
# and probe each clip's duration. Writes vo/<id>.mp3 + vo/durs.json.
#   python scripts/gen-vo.py [voice] [rate]
import asyncio, json, re, subprocess, sys, os
import edge_tts, imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
VOICE = sys.argv[1] if len(sys.argv) > 1 else "en-US-AndrewNeural"  # warm, conversational
RATE = sys.argv[2] if len(sys.argv) > 2 else "-6%"                  # a touch calmer
VODIR = sys.argv[3] if len(sys.argv) > 3 else "scripts/demo-video-out/vo"
lines = json.load(open(f"{VODIR}/lines.json"))

def dur(path):
    p = subprocess.run([FF, "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", p.stderr)
    if not m: return 0.0
    h, mi, s = m.groups(); return int(h)*3600 + int(mi)*60 + float(s)

async def synth(cid, text):
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(f"{VODIR}/{cid}.mp3")

async def main():
    for cid, text in lines.items():
        await synth(cid, text)
    durs = {cid: round(dur(f"{VODIR}/{cid}.mp3"), 3) for cid in lines}
    json.dump({"voice": VOICE, "rate": RATE, "durs": durs}, open(f"{VODIR}/durs.json", "w"), indent=2)
    print(f"voice={VOICE} rate={RATE}")
    for cid, d in durs.items(): print(f"  {cid}: {d:.2f}s")
    assert all(d > 0.5 for d in durs.values()), "a VO clip came out empty/too short"
    print("OK -> vo/durs.json")

asyncio.run(main())

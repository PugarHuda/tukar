# Narration for the Tukar demo video.
#
#   python vo.py
#
# Speaks every scene's `vo` line from script.json with edge-tts (Microsoft's
# neural voices, the same ones Copilot reads with, no API key) into
# public/vo/<id>.mp3, and writes public/vo/vo.json with each clip's measured
# duration so the Remotion composition can size its scenes to the narration, plus every
# word's start and end from the voice's own WordBoundary events for the karaoke captions.
import asyncio, json, os, re, subprocess, sys

import edge_tts
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SCRIPT = json.load(open(os.path.join(HERE, "script.json"), encoding="utf-8"))
OUT = os.path.join(HERE, "public", "vo")
os.makedirs(OUT, exist_ok=True)


def duration_ms(path):
    r = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr)
    if not m:
        raise SystemExit(f"ffmpeg could not read a duration from {path}")
    h, mn, s = m.groups()
    return round((int(h) * 3600 + int(mn) * 60 + float(s)) * 1000)


async def main():
    meta, total = [], 0
    for sc in SCRIPT["scenes"]:
        path = os.path.join(OUT, f"{sc['id']}.mp3")
        words = []
        comm = edge_tts.Communicate(sc["vo"], SCRIPT["voice"], rate=SCRIPT["rate"], boundary="WordBoundary")
        with open(path, "wb") as f:
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    st = chunk["offset"] / 10_000  # 100 ns ticks -> ms
                    words.append({"w": chunk["text"], "s": round(st), "e": round(st + chunk["duration"] / 10_000)})
        ms = duration_ms(path)
        total += ms
        meta.append({"id": sc["id"], "ms": ms, "words": words})
        print(f"  {sc['id']:>4}  {ms/1000:5.1f}s  {sc['vo'][:58]}...")
    json.dump(meta, open(os.path.join(OUT, "vo.json"), "w"), indent=2)
    print(f"\n{len(meta)} lines, {total/1000:.0f}s of narration -> public/vo/vo.json")
    if total / 1000 > 200:
        print("WARNING: narration alone is over 3m20s. Trim script.json.", file=sys.stderr)


asyncio.run(main())

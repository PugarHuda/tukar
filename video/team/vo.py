# Narration for the team video, with word timings for the karaoke captions.
#
#   python team/vo.py
#
# Speaks every scene's `vo` with edge-tts into public/team/vo/<id>.mp3 and writes
# public/team/vo.json: each clip's measured length plus every word's start and end in
# milliseconds, taken from the voice's own WordBoundary events rather than estimated.
import asyncio, json, os, re, subprocess

import edge_tts
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SCRIPT = json.load(open(os.path.join(HERE, "script.json"), encoding="utf-8"))
OUT = os.path.join(ROOT, "public", "team", "vo")
os.makedirs(OUT, exist_ok=True)


def duration_ms(path):
    r = subprocess.run([FFMPEG, "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr)
    if not m:
        raise SystemExit(f"ffmpeg could not read a duration from {path}")
    h, mn, s = m.groups()
    return round((int(h) * 3600 + int(mn) * 60 + float(s)) * 1000)


async def speak(sc):
    path = os.path.join(OUT, f"{sc['id']}.mp3")
    words = []
    comm = edge_tts.Communicate(sc["vo"], SCRIPT["voice"], rate=SCRIPT["rate"], boundary="WordBoundary")
    with open(path, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                s = chunk["offset"] / 10_000  # 100 ns ticks -> ms
                words.append({"w": chunk["text"], "s": round(s), "e": round(s + chunk["duration"] / 10_000)})
    return path, words


async def main():
    meta, total = [], 0
    for sc in SCRIPT["scenes"]:
        path, words = await speak(sc)
        ms = duration_ms(path)
        total += ms
        meta.append({"id": sc["id"], "ms": ms, "words": words})
        print(f"  {sc['id']}  {ms/1000:5.1f}s  {len(words):3d} words  {sc['vo'][:52]}...")
    json.dump(meta, open(os.path.join(ROOT, "public", "team", "vo.json"), "w", encoding="utf-8"), indent=1)
    print(f"\n{len(meta)} lines, {total/1000:.0f}s of narration -> public/team/vo.json")


asyncio.run(main())

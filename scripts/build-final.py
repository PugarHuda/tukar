# Build the FULL submission video: the narrated deck (explanation) followed by the
# narrated live on-chain demo, both with burned-in subtitles.
#
#   deck webm + deck VO + deck subs  -> part A
#   tukar-tight.mp4 (already has VO) + demo subs -> part B
#   concat(A, B) -> build-video/tukar-full.mp4
#
# Subtitles are burned with libass so they survive any player/upload (no sidecar).
# Run after: deck-vo.py, record-deck.mjs, and the demo pipeline (make-vo -> record ->
# mux -> tight-cut, i.e. `npm run video`).
import json, subprocess, os, re, textwrap
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
OUT = "build-video"

def need(p):
    if not os.path.exists(p):
        raise SystemExit(f"missing {p} — run the deck + demo pipelines first (see npm run video:full)")
    return p

def ts(ms):
    ms = max(0, int(ms)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def srt(cues, path):
    """cues: [{startMs, ms, text}] -> an SRT, wrapped to 2 readable lines."""
    out = []
    for n, c in enumerate(cues, 1):
        body = "\n".join(textwrap.wrap(c["text"], 62)[:3])
        out.append(f"{n}\n{ts(c['startMs'])} --> {ts(c['startMs'] + c['ms'])}\n{body}\n")
    open(path, "w", encoding="utf-8").write("\n".join(out))
    return path

def dur_ms(f):
    r = subprocess.run([FFMPEG, "-i", f], capture_output=True, text=True)
    h, m, s = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr).groups()
    return int((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)

def run(cmd, what):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-2500:]); raise SystemExit(f"ffmpeg failed: {what}")

# libass style: readable on the dark deck, matches the brand orange.
STYLE = ("FontName=Segoe UI,Fontsize=17,PrimaryColour=&H00E9F2F2,OutlineColour=&H00050705,"
         "BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=26,Bold=1")
def subfilter(p):  # ffmpeg needs escaped drive-colons inside a filter arg
    return "subtitles=" + p.replace("\\", "/").replace(":", "\\:") + f":force_style='{STYLE}'"

# ---------- part A: deck ----------
dvo = json.load(open(need(f"{OUT}/deckvo.json")))
dsc = json.load(open(need(f"{OUT}/deck-scenes.json")))
deck_v = need(dsc["video"])
by_i = {m["i"]: m for m in dvo}
cues_a = [{"startMs": s["startMs"], "ms": by_i[s["i"]]["ms"], "text": by_i[s["i"]]["text"]}
          for s in dsc["scenes"] if s["i"] in by_i]
srt_a = srt(cues_a, f"{OUT}/deck.srt")

inputs = ["-i", deck_v]
for m in dvo:
    inputs += ["-i", m["file"]]
parts, labels = [], []
for s in dsc["scenes"]:
    i = s["i"]; d = int(s["startMs"])
    parts.append(f"[{i+1}]adelay={d}|{d}[a{i}]"); labels.append(f"[a{i}]")
fc = ";".join(parts) + ";" + "".join(labels) + f"amix=inputs={len(labels)}:normalize=0[aout]"
fc += f";[0:v]{subfilter(srt_a)}[vout]"

partA = f"{OUT}/_partA.mp4"
run([FFMPEG, "-y", *inputs, "-filter_complex", fc, "-map", "[vout]", "-map", "[aout]",
     "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
     "-r", "25", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-shortest", partA],
    "deck part")
print(f"  part A (deck)  {dur_ms(partA)/1000:6.1f}s  {len(cues_a)} subtitle cues")

# ---------- part B: live demo (tukar-tight.mp4 already carries its VO) ----------
tight = json.load(open(need(f"{OUT}/tight.json")))
demo_v = need(tight["video"])
cues_b = [{"startMs": s["startMs"], "ms": s["ms"], "text": s["text"]} for s in tight["scenes"]]
srt_b = srt(cues_b, f"{OUT}/demo.srt")

partB = f"{OUT}/_partB.mp4"
run([FFMPEG, "-y", "-i", demo_v, "-vf", subfilter(srt_b),
     "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
     "-r", "25", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", partB],
    "demo part")
print(f"  part B (demo)  {dur_ms(partB)/1000:6.1f}s  {len(cues_b)} subtitle cues")

# ---------- concat ----------
# Re-encoded both parts to identical codecs/rate above, so the concat demuxer is safe.
lst = f"{OUT}/_concat.txt"
open(lst, "w", encoding="utf-8").write("".join(
    f"file '{os.path.abspath(p).replace(chr(92), '/')}'\n" for p in (partA, partB)))
final = f"{OUT}/tukar-full.mp4"
run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", final], "concat")

total = dur_ms(final)
for p in (partA, partB, lst):
    try: os.remove(p)
    except OSError: pass
print(f"\nFULL OK -> {final}   {total//60000}:{(total%60000)//1000:02d}  (deck + live demo, VO + burned-in subtitles)")
assert total > 60000, "final video suspiciously short"

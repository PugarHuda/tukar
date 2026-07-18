# Burn subtitles onto the demo tight-cut (build-video/tight.json) with libass and
# write a standalone subtitled demo video. Subtitle text comes from tight.json's
# per-scene text (so it matches whatever VO language produced it).
#
#   python scripts/burn-subs.py [out.mp4]   (default build-video/tukar-demo-id.mp4)
import json, subprocess, os, re, textwrap, sys
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
OUT = "build-video"
tight = json.load(open(f"{OUT}/tight.json"))
video = tight["video"]
out = sys.argv[1] if len(sys.argv) > 1 else f"{OUT}/tukar-demo-id.mp4"

def ts(ms):
    ms = max(0, int(ms)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

cues = [{"startMs": s["startMs"], "ms": s["ms"], "text": s["text"]} for s in tight["scenes"]]
srt = f"{OUT}/demo-id.srt"
with open(srt, "w", encoding="utf-8") as f:
    for n, c in enumerate(cues, 1):
        body = "\n".join(textwrap.wrap(c["text"], 78)[:3])
        f.write(f"{n}\n{ts(c['startMs'])} --> {ts(c['startMs'] + c['ms'])}\n{body}\n\n")

# Top-center band (this libass build reads Alignment in the legacy SSA convention, so
# 6 = top-center). MarginV pushes it down BELOW the header row into the static headline
# zone — above the on-chain result status line and well above the interactive panel, so
# the live interaction (counters, reveal, buttons, proof result) is never covered.
STYLE = ("FontName=Segoe UI,Fontsize=11,PrimaryColour=&H00E9F2F2,OutlineColour=&HC0050705,"
         "BorderStyle=3,Outline=4,Shadow=0,Alignment=6,MarginV=150,Bold=1")
subfilter = "subtitles=" + srt.replace("\\", "/").replace(":", "\\:") + f":force_style='{STYLE}'"

cmd = [FFMPEG, "-y", "-i", video, "-vf", subfilter,
       "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-b:a", "160k", out]
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode:
    print(r.stderr[-2000:]); raise SystemExit("burn-subs failed")

p = subprocess.run([FFMPEG, "-i", out], capture_output=True, text=True)
m = re.search(r"Duration: (\d+:\d+:\d+\.\d+)", p.stderr)
print(f"OK -> {out}  ({len(cues)} subtitle, durasi {m.group(1) if m else '?'})")

# Post-process the short-cut recording:
#  1) Speed up ONLY the logged loading/processing ranges (4x) — sped up, NOT cut — and
#     concat back into one silent mp4  (tukar-shortcut-silent.mp4).
#  2) Place each caption's neural-VO clip at the moment that caption appears on the FINAL
#     (post-speedup) timeline, and mux the narration on  (tukar-shortcut.mp4).
#   python scripts/finish-shortcut.py [speed]
import json, re, subprocess, sys, os
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
OUTDIR = "scripts/demo-video-out"
TAG = sys.argv[1].strip() if len(sys.argv) > 1 else ""   # "" = 1:50 cut; "90s" = tight cut
SUF = f"-{TAG}" if TAG else ""
cfg = json.load(open(f"{OUTDIR}/shortcut-ranges{SUF}.json"))
webm = cfg["webm"]
speed = float(sys.argv[2]) if len(sys.argv) > 2 else float(cfg.get("speed", 4))
caps = cfg.get("capMarks", [])
VODICT = cfg.get("voDir", f"{OUTDIR}/vo")
silent = f"{OUTDIR}/tukar-shortcut{SUF}-silent.mp4"
narrated = f"{OUTDIR}/tukar-shortcut{SUF}.mp4"
vo = json.load(open(f"{VODICT}/durs.json"))
VOICE = vo.get("voice", "?")

def duration(path):
    p = subprocess.run([FF, "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", p.stderr)
    h, mi, s = m.groups(); return int(h)*3600 + int(mi)*60 + float(s)

D = duration(webm)

# clamp + sort + drop overlaps/tiny ranges
ranges = sorted(({"start": max(0.0, r["start"]), "end": min(D, r["end"])} for r in cfg["ranges"] if r["end"] - r["start"] >= 2.5), key=lambda r: r["start"])
clean, cur = [], 0.0
for r in ranges:
    if r["start"] >= cur and r["end"] > r["start"]:
        clean.append(r); cur = r["end"]

# alternating normal(1x) / fast(speed) segments covering [0, D]
segs, cursor = [], 0.0
for r in clean:
    if r["start"] - cursor > 0.05: segs.append((cursor, r["start"], 1.0))
    segs.append((r["start"], r["end"], speed)); cursor = r["end"]
if D - cursor > 0.05: segs.append((cursor, D, 1.0))

# ---- 1) SILENT sped-up mp4 ----
parts, labels, expected = [], [], 0.0
for i, (a, b, sp) in enumerate(segs):
    pts = "PTS-STARTPTS" if sp == 1.0 else f"(PTS-STARTPTS)/{sp}"
    parts.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts={pts},fps=25[v{i}]")
    labels.append(f"[v{i}]"); expected += (b - a) / sp
fc = ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(labels)}:v=1:a=0[out]"
r = subprocess.run([FF, "-y", "-i", webm, "-filter_complex", fc, "-map", "[out]",
                    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent],
                   capture_output=True, text=True)
if r.returncode: print(r.stderr[-2500:]); raise SystemExit("speedup failed")
Dsilent = duration(silent)

# ---- source-time -> final-time map (piecewise через segments) ----
def to_final(t):
    acc = 0.0
    for a, b, sp in segs:
        if t <= a: break
        acc += ((min(t, b) - a) / sp) if t < b else (b - a) / sp
        if t < b: break
    return acc

# ---- 2) mux VO: each line starts when its caption appears on the final timeline ----
inputs = ["-i", silent]
delays, used = [], []
for m in caps:
    mp3 = f"{VODICT}/{m['id']}.mp3"
    if not os.path.exists(mp3): continue
    inputs += ["-i", mp3]
    delays.append(int(to_final(m["t"]) * 1000) + 150)  # +150ms after the caption fade
    used.append(m["id"])

aparts, alabels = [], []
for i, dly in enumerate(delays):
    aparts.append(f"[{i+1}]adelay={dly}|{dly}[a{i}]"); alabels.append(f"[a{i}]")
afc = ";".join(aparts) + ";" + "".join(alabels) + f"amix=inputs={len(alabels)}:normalize=0[aout]"
r = subprocess.run([FF, "-y", *inputs, "-filter_complex", afc, "-map", "0:v", "-map", "[aout]",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", narrated],
                   capture_output=True, text=True)
if r.returncode: print(r.stderr[-2500:]); raise SystemExit("vo mux failed")
Dnar = duration(narrated)

# ---- report + self-checks ----
print(f"voice={VOICE}  source {D:.1f}s -> silent {Dsilent:.1f}s (expected ~{expected:.1f}s) -> narrated {Dnar:.1f}s")
print(f"sped-up ranges ({len(clean)} @ {speed}x):")
for r in clean: print(f"    {r['start']:.1f}-{r['end']:.1f}s  ({r['end']-r['start']:.1f}s -> {(r['end']-r['start'])/speed:.1f}s)")
print("VO placement on final timeline:")
for cid, dly in zip(used, delays): print(f"    {cid}: {dly/1000:.1f}s")
has_audio = "Audio:" in subprocess.run([FF, "-i", narrated], capture_output=True, text=True).stderr
assert abs(Dsilent - expected) < 2.0, f"silent duration mismatch {Dsilent:.1f} vs {expected:.1f}"
assert Dsilent < D - 3, "speed-up did not take effect (not shorter)"
assert has_audio, "narrated mp4 has no audio track"
print("self-check OK: loading sped-up-not-cut, narrated has VO, silent fallback kept")
print(f"  narrated: {narrated}\n  silent:   {silent}")

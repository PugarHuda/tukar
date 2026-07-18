# Pecah video demo (build-video/tukar-tight.mp4) menjadi klip per-fitur, memakai
# batas scene di build-video/tight.json. Tiap klip sudah bawa VO scene-nya.
# Output: build-video/clips/NN-nama.mp4
#
#   python scripts/split-clips.py            # per fitur (default, dikelompokkan)
#   python scripts/split-clips.py scenes     # per scene (9 klip, satu per interaksi)
import json, subprocess, os, sys, re
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
t = json.load(open("build-video/tight.json"))
video = "build-video/tukar-tight.mp4"      # cut tanpa subtitle
scenes = sorted(t["scenes"], key=lambda s: s["i"])
durMs = t["durMs"]
start_of = {s["i"]: s["startMs"] for s in scenes}
def end_of(i):  # akhir scene i = mulai scene i+1 (atau akhir video)
    nxt = [s["startMs"] for s in scenes if s["i"] == i + 1]
    return nxt[0] if nxt else durMs

# Kelompok fitur: (nama-file, [indeks scene]). Intro & penutup dilewati di mode fitur.
FEATURES = [
    ("01-kirim-privat",      [1, 2, 3]),  # pilih koridor -> deposit on-chain -> commitment muncul
    ("02-offramp-reflector", [4]),        # reveal jumlah + kurs on-chain dari Reflector
    ("03-withdraw-onchain",  [5]),        # tarik dana, nullifier dibelanjakan
    ("04-disclosure-audit",  [6]),        # bukti disclosure diverifikasi kontrak
    ("05-tamper-ditolak",    [7]),        # klaim palsu ditolak on-chain
]
if len(sys.argv) > 1 and sys.argv[1] == "scenes":
    NAMES = ["00-intro", "01-kirim", "02-deposit", "03-commitment", "04-offramp",
             "05-withdraw", "06-disclosure", "07-tamper", "08-penutup"]
    FEATURES = [(NAMES[s["i"]], [s["i"]]) for s in scenes]

out = "build-video/clips"
os.makedirs(out, exist_ok=True)

def dur(f):
    r = subprocess.run([FFMPEG, "-i", f], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+:\d+:\d+\.\d+)", r.stderr)
    return m.group(1) if m else "?"

made = []
for name, idxs in FEATURES:
    a = start_of[idxs[0]] / 1000.0
    b = end_of(idxs[-1]) / 1000.0
    dst = f"{out}/{name}.mp4"
    cmd = [FFMPEG, "-y", "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-i", video,
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "160k", dst]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-1200:]); raise SystemExit(f"gagal potong {name}")
    made.append((dst, b - a))
    print(f"  {name}.mp4  ({b - a:4.1f}s)  [{dur(dst)}]")

print(f"\n{len(made)} klip -> {out}/")
assert made, "tidak ada klip yang dihasilkan"

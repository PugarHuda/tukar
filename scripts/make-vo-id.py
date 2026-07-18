# VO Bahasa Indonesia (edge-tts) untuk video demo — satu baris per scene, cocok
# dengan alur yang sudah direkam (scripts/record-narrated.mjs). Menulis ke
# build-video/vo*.mp3 + vo.json (nama sama seperti make-vo.py) sehingga mux-video.py
# dan tight-cut.py berjalan tanpa perubahan. Regenerate versi Inggris: npm run video:vo.
import asyncio, subprocess, json, os, re
import edge_tts
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
VOICE = "id-ID-GadisNeural"   # suara neural Indonesia yang natural (perempuan)
RATE = "+4%"
OUT = "build-video"
os.makedirs(OUT, exist_ok=True)

# Satu baris per scene demo (9) — cocok dengan scene yang direkam (koridor Meksiko).
LINES = [
    "Stellar dibangun untuk memindahkan uang sungguhan lintas negara. Tukar membuat uang itu privat di tengah, dan tetap akuntabel di kedua ujungnya.",
    "Pengirim menyetor lima ratus USDC ke koridor menuju Meksiko. Jumlah dan penerimanya tetap tersembunyi di on-chain.",
    "Di dalam browser, Tukar menyusun bukti kepatuhan dan bukti jumlah secara zero-knowledge, lalu menyetorkan USDC testnet asli ke dalam pool.",
    "Di ledger publik kamu hanya melihat sebuah komitmen. Hitungannya dibaca langsung dari kontrak — USDC asli baru saja masuk kustodi, bukan tiruan.",
    "Di sisi penerima dana tiba dalam keadaan terlindungi. Baru saat off-ramp jumlahnya terungkap — sekitar delapan ribu tujuh ratus peso, dengan kurs yang dibaca kontrak langsung dari Reflector on-chain.",
    "Penerima menarik dana on-chain. Nullifier catatan itu dibelanjakan, dan token pun dilepaskan dari pool.",
    "Untuk audit, pemegang hanya membuktikan satu fakta — jumlahnya — dan tidak ada yang lain. Bukti yang sama diverifikasi oleh kontrak Stellar secara langsung.",
    "Dan klaim palsu tidak akan lolos. Ubah jumlahnya, dan langsung ditolak — di on-chain.",
    "Privat di tengah, patuh di kedua ujung. Zero-knowledge sungguhan, live di Stellar. Itulah Tukar.",
]

def dur_ms(f):
    r = subprocess.run([FFMPEG, "-i", f], capture_output=True, text=True)
    h, mn, s = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr).groups()
    return int((int(h) * 3600 + int(mn) * 60 + float(s)) * 1000)

async def main():
    meta = []
    for i, t in enumerate(LINES):
        f = f"{OUT}/vo{i}.mp3"
        await edge_tts.Communicate(t, VOICE, rate=RATE).save(f)
        ms = dur_ms(f)
        meta.append({"i": i, "file": f, "ms": ms, "text": t})
        print(f"  vo{i}: {ms:5d} ms  \"{t[:50]}...\"")
    json.dump(meta, open(f"{OUT}/vo.json", "w"))
    print(f"\n{len(meta)} scene, ~{sum(m['ms'] for m in meta)/1000:.0f}s VO Indonesia -> {OUT}/vo.json")

asyncio.run(main())

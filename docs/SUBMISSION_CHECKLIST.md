# Checklist sebelum submit (catatan internal, BUKAN bagian dari aplikasi)

File ini untuk owner saja. Jangan pernah menempelkan isi file ini ke form SCF.
Jawaban yang dibaca reviewer ada di [`SCF_SUBMISSION.md`](SCF_SUBMISSION.md), dan file itu
sengaja dibersihkan dari semua catatan yang ditujukan ke builder.

Deadline submission: 2026-11-08.

## Status

- [x] Team Description: solo, sudah terisi lengkap (nama, LinkedIn, GitHub, riwayat kerja, prior work)
- [x] Evidence "built and scaled before" (Open Track): sudah ditulis jujur. Building: ya, berulang, solo, tiga di antaranya di domain privacy (Sealed Pair, Diam, Turu). Scaling: tidak ada, dan itu dinyatakan terang-terangan, bukan disamarkan. **Jangan diubah jadi lebih tebal.**
- [x] Threat model + monitoring plan: sudah di-INLINE penuh di SCF_SUBMISSION.md (STRIDE index 16 baris + tabel sinyal monitoring + coverage gaps). Reviewer tidak perlu buka repo.
- [x] Competitive differentiation: sudah di-INLINE (Arcane, Remi, Fairblock, Moonlight, Stellar Private Payments) sebagai satu field sendiri.
- [x] Contract addresses: sudah di-INLINE (15 kontrak + USDC SAC + wallet operasional) di field Current Traction.
- [x] Angka tes cargo: dihitung ulang 2026-09-11 dari `#[test]` di crate. 317 total (pool 55, pool-enforced 71, pool-accumulator 78, pool-timelock 89, policy-registry 6, reserves 6, reserves-aggregate 12). Naik dari 314 karena tiga tes baru di crate pool: dua yang meng-assert vektor public input transfer dan withdraw, dan satu yang memuat WASM verifier asli. Kalau ada commit baru yang menambah tes, hitung ulang sebelum submit.
- [x] Angka AI disclosure: dihitung ulang 2026-09-11, 242 dari 292 commit. Angka ini bergerak, jadi di submission ditulis dengan tanggalnya. **Hitung ulang di hari submit** dengan:
      `git log --format="%(trailers:key=Co-Authored-By,valueonly)" | sort | uniq -c`
- [x] Budget: $135,000 di `SCF_BUILD_PROPOSAL.md` section 6. Komposisinya: founder 26 minggu full-time $45,500, lima engagement kontraktor $80,000, infrastruktur 6 bulan $9,500. Subtotal tranche pas di 10/20/30/40 ($13,500 / $27,000 / $40,500 / $54,000). Yang perlu dikonfirmasi owner: (a) rate founder $1,750/minggu, (b) kesediaan benar-benar keluar dari SmartID selama 6 bulan, karena seluruh rencana bergantung pada itu, (c) apakah lima engagement kontraktor itu realistis untuk dicari dan dibayar.
- [x] Dokumentasi terpadu: sudah diputuskan. Situs dokumentasi yang dipakai adalah https://tukar-six.vercel.app/docs (dicek 200 pada 2026-09-11), repo sebagai sumber versi. Tidak perlu Gitbook.
- [x] Build Track: Open Track (alasannya di submission dan di proposal section 2)
- [x] Referral: Yes + code REF-RISEI-449 (dari Kenny). Di form SCF ubah dari "No" ke "Yes" lalu masukkan kode.
- [ ] **Video presentation tim** (Open Track minta ini; video demo saja tidak cukup). Ini satu-satunya field yang masih kosong di submission.
- [ ] Cek form referral terpisah dari Kenny:
      https://docs.google.com/forms/d/e/1FAIpQLSfMWF9cALLvIY_RLUagBbmE7abviwdTckxpkqTdvsdMxqhdUg/viewform
      Isi dengan kode yang sama. Platform referrer: https://raven.stellar.buzz/
- [ ] Cek batas karakter tiap field. Submission sekarang jauh lebih panjang karena semua materi wajib di-inline. Kalau ada field yang dipotong form, urutan pemotongan yang aman:
      1. Potong prosa di field "Build Track" reasoning (paling bisa dipadatkan).
      2. Pindahkan tabel kontrak additive ke field lain, jangan hapus alamat pool + 8 verifier.
      3. **Jangan pernah** potong: konsesi jujur (tidak ada user, tidak ada volume, tidak ada keunggulan traksi atas Remi, "On scaling: no"), STRIDE index, atau tabel sinyal monitoring. Tiga itu yang dinilai.
- [ ] Kalau form SCF tidak punya field "Competitive landscape and differentiation", tempelkan blok itu di akhir field Current Traction atau Project Description. Jangan dibuang.

## Yang tidak boleh berubah

- Semua konsesi jujur. Reviewer prescreen menyebut ini bagian terkuat dari paket.
- Angka budget. Sudah dihitung ulang sel per sel dan aritmatikanya tepat.
- Klaim anchor. Belum ada satu pun anchor yang dihubungi (lihat `ANCHOR_OUTREACH.md`:
  "Nothing here has been sent"). Jangan pernah menulis "partnered with", "working with",
  atau menyebut nama kontak orang.

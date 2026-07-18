# Tukar — Skrip Pitch (Bahasa Indonesia)

Referensi narasi per slide untuk deck di **https://tukar-six.vercel.app/deck**
(11 slide; slide 10 memutar demo on-chain). Tekan **F** untuk fullscreen, panah
**← →** untuk pindah slide.

Total ± 2,5–3 menit (belum termasuk video demo di slide 10).

---

## Slide 1 — Pembukaan
> Halo semuanya, saya Huda. Hari ini saya ingin memperkenalkan **Tukar** — solusi remitansi lintas negara yang dibangun di atas Stellar. Idenya sederhana: pengguna mengirim USDC, proses transfernya tetap privat di tengah, lalu penerima mencairkannya jadi mata uang lokal. Privasi terjaga, tanpa mengorbankan kepatuhan.

## Slide 2 — Masalah
> Stellar dirancang untuk pembayaran lintas negara yang cepat dan murah. Tapi ada satu masalah: semua transaksi di ledger bersifat publik. Siapa yang mengirim, siapa yang menerima, berapa jumlahnya, bahkan pola transaksinya — bisa dilihat siapa saja. Untuk pekerja migran yang rutin kirim uang ke keluarga, data keuangan mereka jadi terbuka permanen.

## Slide 3 — Solusi
> Tukar mengatasi itu. Dana masuk sebagai USDC, diproses privat selama di dalam sistem, lalu keluar jadi mata uang lokal — sudah live di **sepuluh koridor, termasuk Indonesia, Filipina, dan Vietnam**. Dan kalau regulator butuh bukti, pengguna cukup mengungkap satu informasi yang diminta, tanpa membuka seluruh riwayatnya.

## Slide 4 — Zero-Knowledge
> Privasi Tukar benar-benar dibangun dengan zero-knowledge proof. Ada empat sirkuit utama: transfer privat, pengecekan compliance, selective disclosure, dan pembaruan Merkle tree. Semua proof dibuat langsung di browser dan diverifikasi oleh smart contract di Stellar. Jadi zero-knowledge bukan fitur tambahan — ini inti cara kerja Tukar. Tanpa itu, produknya tidak ada.

## Slide 5 — Berjalan di Stellar
> Seluruh sistem jalan langsung di atas Stellar. Ada satu pool contract yang menyimpan USDC asli, plus empat verifier contract yang memakai fungsi BN254 bawaan Stellar Protokol 25 dan 26. Jadi verifikasi proof-nya benar-benar dilakukan di jaringan Stellar — lima kontrak, semuanya live di testnet.

## Slide 6 — Integrasi Ekosistem
> Tukar juga terintegrasi ke ekosistem Stellar, dan integrasinya nyata — bukan hiasan. Saat off-ramp, contract mengambil kurs terbaru dari **Reflector secara on-chain**, dan kalau kurs di bawah batas minimum pengguna, pencairan otomatis ditolak. Jadi oracle-nya menggerakkan dana, bukan sekadar menampilkan angka. Transaksi juga gasless lewat fee-bump bawaan Stellar.

## Slide 7 — Yang Benar-Benar Nyata
> Ini bukan prototype dengan token simulasi. Dananya USDC asli. Nilainya selalu terikat ke cryptographic commitment, Merkle tree-nya dikelola sepenuhnya trustless — tanpa admin backdoor — dan trusted setup-nya pakai Powers of Tau yang sudah standar di ekosistem zero-knowledge.

## Slide 8 — Sudah Terbukti Berjalan
> Dan semuanya terverifikasi, bukan sekadar klaim. Smart contract-nya lolos **tiga puluh enam** unit test, seluruh alur utama jalan lewat **sebelas** pengujian end-to-end langsung di on-chain, termasuk percobaan double-spend yang berhasil **ditolak** oleh sistem.

## Slide 9 — Keterbatasan  *(singkat, percaya diri — ± 15 detik)*
> Saya juga mau jujur soal batasannya. Tukar masih kelas hackathon, sudah hardened di testnet, tapi belum diaudit profesional — jadi belum untuk aset bernilai tinggi. **Tiga langkah berikutnya sudah jelas:** audit keamanan, ceremony trusted setup tahap dua, dan menggandeng satu anchor berlisensi untuk pilot. Kejujuran ini justru bagian dari desainnya.

## Slide 10 — Demo
> Daripada cuma menjelaskan, sekarang saya tunjukkan Tukar bekerja lewat demo singkat — sekitar **satu setengah menit**, dari deposit sampai pencairan dana, semuanya on-chain sungguhan.

*(Putar video di slide. Kalau waktu mepet, lewati bagian audit dan langsung ke penutup.)*

## Slide 11 — Penutup
> Sebagai penutup: Tukar membuktikan remitansi lintas negara bisa tetap privat tanpa mengorbankan transparansi yang dibutuhkan regulator. Dengan zero-knowledge dan infrastruktur Stellar, privasi dan kepatuhan tidak harus bertentangan. Terima kasih — saya siap menjawab pertanyaan.

---

## Catatan penyampaian

- **Slide 9 jangan dibuang.** Hackathon ini secara eksplisit menghargai kejujuran
  ("honest work-in-progress > polished mystery"), dan juri hampir pasti menanyakan
  audit/mainnet. Lebih baik kamu yang membingkai duluan. Kunci: singkat, langsung
  pivot ke roadmap, jangan berlama-lama di kelemahan.
- **Ronde cepat (≈3 menit):** lipat slide 9 ke penutup — *"Tukar masih testnet dan
  belum diaudit; audit dan pilot dengan anchor berlisensi jadi langkah berikutnya."*
- **Kalau ditanya sesuatu yang belum ada** → akui langsung ("itu di roadmap, belum
  dibangun"). Pola jujur ini yang bikin poin kuat.
- **Angka yang harus lancar:** 5 kontrak · 4 sirkuit · 10 koridor · 36/36 tes · 11/11
  e2e · track **Local Finance & Real-World Access**.

Untuk 10 antisipasi pertanyaan juri + jawabannya, lihat catatan Demo Day terpisah.

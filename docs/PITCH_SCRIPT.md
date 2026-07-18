# Tukar, Skrip Pitch (Bahasa Indonesia)

Referensi narasi per slide untuk deck di **https://tukar-six.vercel.app/deck**
(11 slide; slide 10 memutar demo on-chain). Tekan **F** untuk fullscreen, panah
kiri/kanan untuk pindah slide.

Total sekitar 2,5 sampai 3 menit (belum termasuk video demo di slide 10).

**Tanda jeda:**
- **(jeda)** artinya berhenti sebentar, sekitar satu detik. Tarik napas, biar kalimat berikutnya kena.
- **(JEDA)** artinya berhenti agak lama, sekitar dua detik. Dipakai untuk penekanan penting.
- Antar slide, diamkan sekitar dua detik sambil memindahkan slide, jangan buru-buru.

---

## Slide 1, Pembukaan
> Halo semuanya, saya Huda. (jeda) Hari ini saya ingin memperkenalkan Tukar, solusi remitansi lintas negara yang dibangun di atas Stellar. (jeda) Idenya sederhana. Pengguna mengirim USDC, proses transfernya tetap privat di tengah, lalu penerima mencairkannya menjadi mata uang lokal. (jeda) Privasi terjaga, tanpa mengorbankan kepatuhan.

## Slide 2, Masalah
> Stellar dirancang untuk pembayaran lintas negara yang cepat dan murah. (jeda) Tapi ada satu masalah. Semua transaksi di ledger bersifat publik. (jeda) Siapa yang mengirim, siapa yang menerima, berapa jumlahnya, bahkan pola transaksinya, bisa dilihat siapa saja. (JEDA) Untuk pekerja migran yang rutin mengirim uang ke keluarga, data keuangan mereka jadi terbuka permanen.

## Slide 3, Solusi
> Tukar mengatasi itu. (jeda) Dana masuk sebagai USDC, diproses privat selama berada di dalam sistem, lalu keluar menjadi mata uang lokal. Sudah live di sepuluh koridor, termasuk Indonesia, Filipina, dan Vietnam. (JEDA) Dan kalau regulator butuh bukti, pengguna cukup mengungkap satu informasi yang diminta, tanpa membuka seluruh riwayatnya.

## Slide 4, Zero-Knowledge
> Privasi Tukar benar-benar dibangun menggunakan zero-knowledge proof. (jeda) Ada empat sirkuit utama. Transfer privat, pengecekan compliance, selective disclosure, dan pembaruan Merkle tree. (jeda) Semua proof dibuat langsung di browser, lalu diverifikasi oleh smart contract di Stellar. (jeda) Jadi zero-knowledge bukan fitur tambahan. Ini inti cara kerja Tukar. (JEDA) Tanpa itu, produknya tidak ada.

## Slide 5, Berjalan di Stellar
> Seluruh sistem jalan langsung di atas Stellar. (jeda) Ada satu pool contract yang menyimpan USDC asli, plus empat verifier contract yang memakai fungsi BN254 bawaan Stellar Protokol 25 dan 26. (jeda) Jadi verifikasi proof-nya benar-benar dilakukan di jaringan Stellar. Lima kontrak, semuanya live di testnet.

## Slide 6, Integrasi Ekosistem
> Tukar juga terintegrasi ke ekosistem Stellar, dan integrasinya nyata, bukan hiasan. (jeda) Saat proses off-ramp, contract mengambil kurs terbaru dari Reflector secara on-chain. (jeda) Kalau kurs berada di bawah batas minimum pengguna, pencairan otomatis ditolak. (jeda) Jadi oracle-nya menggerakkan dana, bukan sekadar menampilkan angka. (jeda) Transaksi juga gasless lewat fee-bump bawaan Stellar.

## Slide 7, Yang Benar-Benar Nyata
> Ini bukan prototype dengan token simulasi. (jeda) Dananya USDC asli. Nilainya selalu terikat ke cryptographic commitment, Merkle tree-nya dikelola sepenuhnya trustless, tanpa admin backdoor. (jeda) Dan trusted setup-nya memakai Powers of Tau, yang sudah menjadi standar di ekosistem zero-knowledge.

## Slide 8, Sudah Terbukti Berjalan
> Dan semuanya terverifikasi, bukan sekadar klaim. (jeda) Smart contract-nya lolos tiga puluh enam unit test. Seluruh alur utama jalan lewat sebelas pengujian end-to-end langsung di on-chain. (JEDA) Termasuk percobaan double-spend, yang berhasil ditolak oleh sistem.

## Slide 9, Keterbatasan  (singkat, percaya diri, sekitar 15 detik)
> Saya juga mau jujur soal batasannya. (jeda) Tukar masih kelas hackathon, sudah hardened di testnet, tapi belum diaudit profesional. Jadi belum ditujukan untuk aset bernilai tinggi. (jeda) Tiga langkah berikutnya sudah jelas. Audit keamanan, ceremony trusted setup tahap dua, dan menggandeng satu anchor berlisensi untuk pilot. (JEDA) Kejujuran ini justru bagian dari desainnya.

## Slide 10, Demo
> Daripada hanya menjelaskan, sekarang saya tunjukkan Tukar bekerja lewat demo singkat. (jeda) Sekitar satu setengah menit, dari deposit sampai pencairan dana, semuanya on-chain sungguhan.

(Putar video di slide. Kalau waktu mepet, lewati bagian audit dan langsung ke penutup.)

## Slide 11, Penutup
> Sebagai penutup. (jeda) Tukar membuktikan remitansi lintas negara bisa tetap privat, tanpa mengorbankan transparansi yang dibutuhkan regulator. (jeda) Dengan zero-knowledge dan infrastruktur Stellar, privasi dan kepatuhan tidak harus saling bertentangan. (JEDA) Terima kasih. Saya siap menjawab pertanyaan.

---

## Catatan penyampaian

- **Slide 9 jangan dibuang.** Hackathon ini secara eksplisit menghargai kejujuran,
  dan juri hampir pasti menanyakan audit atau mainnet. Lebih baik kamu yang
  membingkai duluan. Kuncinya singkat, langsung pivot ke roadmap, jangan berlama-lama
  di kelemahan.
- **Ronde cepat (sekitar 3 menit):** lipat slide 9 ke penutup. Contoh, "Tukar masih
  testnet dan belum diaudit. Audit dan pilot dengan anchor berlisensi jadi langkah
  berikutnya."
- **Kalau ditanya sesuatu yang belum ada,** akui langsung. Contoh, "itu ada di
  roadmap, belum dibangun." Pola jujur ini yang bikin poin kuat.
- **Angka yang harus lancar:** 5 kontrak, 4 sirkuit, 10 koridor, 36 dari 36 tes,
  11 dari 11 e2e, track Local Finance and Real-World Access.
- **Tempo:** jangan cepat. Lebih baik pelan dan jelas. Manfaatkan setiap (jeda),
  itu bikin kamu terdengar percaya diri, bukan gugup.

Untuk 10 antisipasi pertanyaan juri beserta jawabannya, lihat catatan Demo Day terpisah.

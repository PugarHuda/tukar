# Tukar, Skrip Cadangan Narasi Demo (Bahasa Indonesia)

Dipakai **kalau audio video demo mati** saat presentasi. Bisukan videonya, lalu
baca skrip ini sambil video jalan. Setiap baris punya penanda waktu yang cocok
dengan versi video sekitar 1 menit 23 detik (`build-video/tukar-demo-id.mp4`,
juga di slide 10 `tukar-six.vercel.app/deck`).

Tanda **(jeda)** artinya berhenti sebentar. Baca dengan tenang, jangan buru-buru.
Kalau video sedikit lebih cepat dari bacaan, tidak masalah, ikuti saja alurnya.

---

**0:00 sampai 0:12, Halaman awal lalu masuk ke console**
> Ini Tukar, berjalan langsung di Stellar testnet. (jeda) Uang masuk sebagai USDC, menyeberang secara privat, lalu keluar menjadi mata uang lokal.

**0:13, Layar Sender**
> Pengirim memasukkan lima ratus USDC, tujuannya koridor Meksiko. (jeda) Jumlah dan penerimanya tidak ditampilkan di ledger publik.

**0:20, Deposit diproses**
> Di dalam browser, Tukar menyusun bukti compliance dan bukti jumlah, lalu menyetorkan USDC ke pool contract.

**0:29, Corridor, commitment muncul**
> Di ledger, yang terlihat hanya sebuah commitment. (jeda) Angka ini dibaca langsung dari kontrak, jadi USDC-nya memang sudah masuk ke pool.

**0:39, Off-ramp, jumlah diungkap**
> Di sisi penerima, dana tiba dalam keadaan terlindungi. (jeda) Baru saat off-ramp jumlahnya ditampilkan. Sekitar delapan ribu tujuh ratus peso, dengan kurs yang dibaca kontrak dari Reflector secara on-chain.

**0:50, Withdraw**
> Penerima menarik dananya on-chain. (jeda) Nullifier catatan itu ditandai terpakai, dan token dilepaskan dari pool.

**0:58, Audit, disclosure proof**
> Untuk audit, pemegang membuktikan satu fakta saja, yaitu jumlahnya. (jeda) Bukti yang sama diverifikasi oleh kontrak Stellar.

**1:07, Klaim palsu ditolak**
> Kalau jumlahnya diubah menjadi klaim palsu, (jeda) kontrak menolaknya di on-chain.

**1:14 sampai selesai, Penutup**
> Privat di tengah, patuh di kedua ujung. (jeda) Itu Tukar.

---

## Tips pakai
- Kalau audionya normal, tidak perlu skrip ini. Cadangan saja.
- Kalau audio mati, klik ikon **mute** di video, lalu baca dari sini.
- Titik paling penting untuk pas dengan layar: **0:39 (angka MXN muncul)** dan
  **0:58 (hasil "Verified on-chain" muncul)**. Kalau cuma bisa sinkron di dua titik
  itu, sisanya akan mengikuti dengan sendirinya.
- Sebagai jaring pengaman terakhir, kamu bisa **jeda video** di momen kunci
  (setelah angka MXN muncul, setelah hasil audit muncul), jelaskan, lalu lanjutkan.

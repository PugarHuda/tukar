> Catatan: Ini versi studi Bahasa Indonesia untuk pemahaman founder. Untuk sesi Q&A yang sebenarnya (dalam bahasa Inggris), gunakan file `JUDGE_QA.md` versi Inggris.

# Tukar, 20 pertanyaan juri beserta jawabannya

Persiapan untuk sesi Q&A 2 menit. Ditulis seolah-olah seorang juri sedang menekan. Panelnya dua investor (Spartan Group, DWF Ventures), tiga orang teknis (Stellar DevRel, para founder Noether DEX, Lumen Loop), dan satu orang ekosistem (Stellar India / Rise In). Jawaban sengaja dibuat singkat, ucapkan persis seperti cara membacanya, dan pertahankan catatan jujurnya. Kategorinya adalah Payments and Consumer Applications.

Fakta cepat yang bisa dijadikan pegangan: 7 circuit Circom/Groth16/BN254, 8 kontrak Soroban yang live di testnet, 52 contract test yang lulus. USDC testnet asli. Sisi fiat (edge) masih disimulasikan. Belum diaudit.

---

## Bisnis dan pasar

**1. Apa moat (keunggulan pertahanan) kalian? Kenapa wallet besar atau anchor tidak bisa saja menambahkan ini kuartal depan?**
Bagian yang sulit bukan privasinya, tapi kepatuhan (compliance) yang terjalin ke dalam privasi itu. Setiap deposit membuktikan di dalam circuit bahwa pengirim ada di allow-list dan tidak ada di deny-list yang kena sanksi, terikat ke kuncinya, dan pemegang dana bisa membuktikan satu fakta ke regulator yang dicek on-chain. Seluruh tumpukan itu, tujuh circuit dan delapan kontrak yang terkait ke rail anchor, sudah live di testnet. Wallet yang menambahkan mixer hanya mendapat privasi tanpa jawaban untuk regulator. Menempelkan lapisan compliance kami itu pekerjaan bertahun-tahun, bukan kerjaan satu sore.

**2. Bagaimana kalian menghasilkan uang?**
Tukar adalah kaki penyelesaian (settlement leg) privat di antara para anchor, bukan aplikasi konsumen lain yang harus kami cari penggunanya. Pendapatannya adalah take-rate tipis dari volume settlement, dibayar oleh anchor dan penyedia pembayaran yang mengalirkan dana lewat koridor ini. Modelnya B2B2C, jadi kami tumbuh mengikuti volume mereka, bukan membeli pelanggan satu per satu.

**3. Seberapa besar pasarnya, dan kenapa sekarang?**
Remitansi ke negara-negara berpenghasilan lebih rendah sekitar $669B pada 2023, dan mengirim $200 masih memakan biaya sekitar 6.2%, lebih dari dua kali lipat target PBB dan nyaris tidak bergerak selama satu dekade. Itu angka Bank Dunia. Rail stablecoin akhirnya membuat transfer jadi murah, tapi juga membuatnya sepenuhnya publik, yang tidak bisa diterima oleh uang yang teregulasi. Kami menutup celah itu sekarang, saat rail dan verifikasi on-chain sudah tersedia.

**4. Siapa pelanggan pertama kalian, dan siapa yang sebenarnya membayar?**
Pengguna akhirnya adalah pekerja yang mengirim uang ke kampung halaman dan keluarga yang menerimanya dalam mata uang lokal. Pelanggan yang membayar adalah anchor atau penyedia pembayaran berlisensi yang mau punya koridor privat yang tetap bisa diaudit. Kami masuk pasar dengan satu jalur bervolume tinggi dan satu anchor berlisensi dulu, lalu menambah koridor.

**5. Apa bedanya kalian dengan Veil, OLIO, atau mixer apa pun?**
Mixer seperti Veil itu privat tapi tidak bisa menjawab regulator, jadi operator berlisensi tidak bisa menyentuhnya. Payment link privat seperti OLIO memindahkan kripto antar pengguna, bukan fiat asli yang menyeberang batas negara. Kami adalah satu-satunya yang privat untuk pengguna dan bisa dibuktikan (provable) ke regulator, di atas koridor remitansi nyata dengan fiat di kedua sisinya. Privat, patuh, dan lintas batas sekaligus. Kombinasi itu tidak punya padanan siap pakai.

**6. Bukankah ini cuma Stellar Confidential Tokens dengan langkah tambahan?**
Confidential Tokens menyembunyikan saldo dan jumlah tapi tetap membuat pengirim dan penerima terlihat, jadi sifatnya confidential (rahasia), bukan anonymous (anonim). Itu cocok untuk payroll atau treasury. Koridor remitansi membocorkan siapa-bayar-siapa kalau pihak-pihaknya publik, jadi kami duduk satu tingkat lebih privat: kami sembunyikan jumlahnya dan kedua counterparty-nya, dan kami sertakan primitif compliance yang sama, yaitu tampilan auditor, selective disclosure (pengungkapan selektif), dan allow-deny, secara independen. Kami adalah tier remitansi yang lebih privat dari tumpukan yang sama, dan kami tetap composable dengannya, bukan pesaingnya.

**7. Privasi plus perpindahan uang itu justru cara Tornado Cash kena sanksi. Kenapa kalian bukan liabilitas hukum?**
Karena kami membangun compliance dari dalam, bukan mengakalinya dari luar. Tornado sama sekali tidak tahu siapa yang memakainya. Setiap deposit Tukar membuktikan keanggotaan di allow-list dan bukan-keanggotaan di deny-list yang kena sanksi sebelum nilai apa pun berpindah, dan pemegang dana bisa mengungkap fakta spesifik ke regulator yang diverifikasi on-chain. Ini dirancang untuk dijalankan oleh anchor berlisensi yang sudah KYC. Itu kebalikan dari mixer yang tanpa-tanya-apa-apa.

## Teknis

**8. Apakah zero-knowledge-nya benar-benar diverifikasi on-chain, atau cuma di browser?**
Keduanya, dan bagian on-chain itulah yang paling penting. Proof-nya dibuat di sisi klien di dalam browser sehingga rahasia tidak pernah keluar dari perangkat, lalu diverifikasi oleh kontrak Soroban di testnet. Kalian bisa menyaksikannya langsung: disclosure yang asli mengembalikan valid, dan proof yang dirusak mengembalikan InvalidProof dari kontraknya. Ini pairing check asli on-chain, bukan badge di UI.

**9. Apa yang secara jujur belum terpasang, atau masih disederhanakan?**
Tiga hal. On-ramp dan off-ramp fiat masih disimulasikan di sisi-sisinya. Alur SEP sudah terintegrasi dengan reference anchor milik SDF, tapi ramp yang production butuh anchor KYC berlisensi, yang merupakan langkah bisnis. Trusted-setup ceremony-nya nyata tapi kami menjalankan putarannya di satu mesin untuk membuktikan prosesnya. Dan ini sudah di-harden di testnet tapi belum diaudit secara profesional, jadi belum untuk uang sungguhan. Semua yang di tengah, yaitu proof, deposit, verifikasi, pembacaan oracle, itu nyata.

**10. Bagaimana kalian mencegah double-spending (pembelanjaan ganda)?**
Setiap note mengungkap sebuah nullifier (penanda anti double-spend) saat dibelanjakan, dan kontrak pool menolak nullifier mana pun yang sudah pernah dilihatnya. Circuit transfer juga membuktikan bahwa note itu ada di Merkle tree dan bahwa nilai terjaga (conserved). Kami tunjukkan percobaan double-spend yang ditolak on-chain di dalam demo.

**11. Kenapa Groth16 di atas BN254, dan apakah Soroban benar-benar mendukung itu?**
Groth16 di atas BN254 adalah jalur proving yang paling murah dan paling matang, dan itulah yang dihasilkan snarkjs, sehingga seluruh toolchain-nya sudah teruji lapangan. Soroban memverifikasinya memakai host function dari protokol terbaru untuk pairing check, itulah kenapa delapan kontrak verifier-nya berjalan di testnet hari ini, bukan sekadar rancangan di atas kertas.

**12. Trusted setup itu risiko backdoor. Bagaimana kalau itu dikompromikan?**
Groth16 butuh setup per-circuit, itu tradeoff yang sudah diketahui. Fase satu adalah powers-of-tau Hermez, yang sudah dipercaya seluruh ekosistem. Fase dua adalah ceremony kami sendiri, tiga kontribusi plus beacon publik, dan kunci yang live byte-nya identik dengan transkrip yang di-commit. Celah jujurnya adalah kami menjalankan putaran-putaran itu di satu mesin, jadi soundness one-honest-party yang penuh butuh kontributor yang benar-benar independen, yang merupakan hal pertama yang akan kami danai.

**13. Di dalam compliance proof, apa yang mencegah saya melakukan deposit sebagai orang lain?**
Circuit-nya mengikat proving key ke sumber transaksi, sourceKey sama dengan field dari akun from, sehingga proof hanya valid kalau akun yang menandatangani deposit itu sama dengan akun yang compliance-nya dibuktikan. Kalian tidak bisa meminjam identitas yang ada di allow-list. Proof-nya menunjukkan keanggotaan allow-list dan bukan-keanggotaan deny-list yang kena sanksi sekaligus.

**14. Anonymity set kalian kecil sekali di demo. Bukankah itu merusak privasinya?**
Privasi berkembang seiring pemakaian pool, itu memang sifat bawaan model privacy-pool, dan kami menyatakannya di aplikasi, kami bahkan menampilkan ukuran anonymity set supaya tidak ada yang tertipu. Pool skala demo memang punya set yang kecil. Desainnya benar, set-nya tumbuh dengan volume nyata, dan justru itulah kenapa distribusi lewat anchor berlisensi penting.

**15. Bagaimana gerbang oracle bekerja, dan apa yang mencegah harga yang dimanipulasi?**
Rate off-ramp dibaca on-chain dari oracle Reflector, atas median dari lima sumber, jadi satu feed yang dimanipulasi tidak bisa menggesernya. Penarikan (withdraw) membawa gerbang min-receive: pool membaca ulang oracle saat settlement dan menolak melepas dana di bawah sekitar 99 persen dari kuotasi, dan gerbangnya gagal-tertutup (fail closed) kalau feed-nya basi atau hilang. Dana tidak pernah berpindah pada harga yang buruk.

**16. Dalam audit agregat, bukankah pemegang dana bisa saja meninggalkan pembayaran yang tidak mereka sukai?**
Tidak, dan ini ditegakkan oleh kontrak, bukan dengan memercayai UI. Regulator mendaftarkan permintaan audit yang spesifik on-chain, dan disclose_aggregate menolak audit hash apa pun yang tidak pernah didaftarkan. Pemegang dana harus menjawab permintaan itu persis, atas himpunan yang persis, jadi mereka tidak bisa memilih-milih (cherry-pick).

**17. Apakah proving di ponsel benar-benar realistis?**
Ya. Proof Groth16 berjalan di browser lewat WASM dalam beberapa detik, yang oke saja untuk tindakan mengirim uang, dan demo-nya melakukannya dengan layout mobile-first. Rahasianya tidak pernah keluar dari perangkat, dan itulah intinya. Kami tunjukkan proof yang sedang dibangun di ponsel dalam walkthrough-nya.

## Ekosistem, produk, dan permintaan

**18. Kenapa Stellar dan bukan chain lain?**
Karena sisi-sisinya (edge) itulah produknya. Stellar dibangun untuk pembayaran lintas batas dan stablecoin, punya jaringan anchor untuk on-ramp dan off-ramp fiat yang nyata, biaya rendah, standar SEP yang kami integrasikan, Soroban untuk memverifikasi proof on-chain, dan oracle Reflector yang kami jadikan gerbang settlement. Bagian tengah yang privat hanya berarti kalau sisi fiat-nya nyata, dan Stellar adalah tempat sisi-sisi itu sudah ada.

**19. Apakah pengirim uang sungguhan mau memakai ini? Bagaimana dengan onboarding-nya?**
Kedua aplikasi konsumennya mobile-first dan tidak ada seed phrase untuk memulai, satu ketuk mengaktifkan kunci testnet asli, dan penerimanya cukup menempel claim note lalu mencairkan dana. Proof dan compliance berjalan di baliknya, pengirim dan penerima hanya melihat kirim dan klaim. Untuk peluncuran nyata, ini menjangkau orang lewat anchor atau penyedia berlisensi di koridor bervolume tinggi, jadi pengguna mendapat cash-in dan cash-out yang familiar dan privasinya tak terlihat.

**20. Apa yang nyata di demo, dan apa yang akan kalian lakukan dengan hadiahnya?**
Nyata: USDC testnet, deposit dan withdraw on-chain, tujuh circuit yang proving di browser dan diverifikasi oleh delapan kontrak di testnet, off-ramp bergerbang-oracle, dan disclosure yang diverifikasi on-chain dengan proof yang dirusak ditolak. Disimulasikan: ramp fiat dan satu kunci demo bersama. Dengan pendanaan, langkah pertamanya adalah audit profesional, trusted-setup ceremony yang benar-benar terdistribusi, dan satu koridor anchor berlisensi yang live end-to-end, yang juga merupakan jalan menuju build award dari Stellar Community Fund.

---

## Dua kalimat cadangan
- Moat dalam satu kalimat: "Private for the user, and provable to a regulator, on a real cross-border corridor."
- Kalimat kejujuran yang dipercaya juri: "It is real on testnet, not audited, and the fiat edges are simulated. Everything in the middle is real, and you can verify it on-chain right now."

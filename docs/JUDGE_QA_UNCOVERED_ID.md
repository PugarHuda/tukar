> Catatan: ini versi belajar berbahasa Indonesia untuk founder. Referensi Q&A yang sebenarnya (dalam bahasa Inggris) tetap `JUDGE_QA_UNCOVERED.md`.

# 20 pertanyaan yang tidak dijawab oleh deck dan demo

Ini adalah celah-celahnya. Deck 9 slide dan demo 90 detik sudah mencakup masalah, moat (keunggulan yang sulit ditiru), pasar, kedalaman teknis, dan verifikasi on-chain (langsung di ledger blockchain). Yang TIDAK dicakup: tim, traksi, operasi regulatori, tata kelola kunci (key governance), skala, ekonomi, dan recovery (pemulihan saat ada yang gagal). Juri yang tajam akan langsung menyerang ke sini. Jawaban singkat dan sudut pandangnya ada di bawah. Tiga pertanyaan soal tim dan traksi harus kamu isi sendiri, jangan mengarang.

---

## Tim dan traksi (isi sendiri)

**1. Siapa saja yang ada di tim, dan kenapa kalian yang tepat untuk membangun ini?**
Jawab sendiri, jangan mengarang. Sebut orang-orangnya dan satu kredensial masing-masing yang mengurangi risiko (ZK, Stellar, payments, atau compliance/kepatuhan). Kalau kalian masih tahap awal, akui saja dan alihkan ke build yang sudah jalan di testnet (jaringan uji coba).

**2. Apakah sudah ada user, pilot, atau letter of intent (LOI, surat pernyataan minat)?**
Jawab sendiri, dengan jujur. Kalau belum ada, katakan "belum, ini masih build di testnet," lalu alihkan ke ask (permintaan pendanaan): satu pilot bersama anchor berlisensi adalah persis yang kami galang dananya. Jangan menyiratkan traksi yang tidak kalian punya.

**3. Apa yang sudah pernah kalian rilis yang membuktikan kalian mampu menyelesaikan ini?**
Jawab sendiri, jangan mengarang. Tunjuk fakta bahwa ini sudah 7 circuit, 8 contract, dan 52 test yang hidup di testnet, yang merupakan bukti terkuat di ruangan.

## Operasi regulatori

**4. Deny-list (daftar alamat yang diblokir) cuma 8 alamat. Daftar sanksi asli ribuan dan berubah tiap hari. Bagaimana kalian menjaganya tetap terkini secara on-chain?**
Yang 8 itu cuma set demonstrasi. Di produksi, operator menyinkronkan daftar terpelihara (OFAC, UN) ke dalam allow-root dan deny-set on-chain secara terjadwal, idealnya lewat penyedia data compliance berlisensi. Cakupan global real-time adalah masalah data-ops (operasi data), bukan masalah circuit, dan justru itu alasan untuk bermitra dengan vendor compliance ketimbang membuat sendiri.

**5. Bagaimana kalian memenuhi Travel Rule (aturan pertukaran data pengirim/penerima) dan kewajiban AML (anti pencucian uang) untuk corridor sungguhan?**
Anchor berlisensi di kedua ujung yang melakukan KYC dan Travel Rule, itu memang sudah tugas mereka. Kami memberi mereka settlement (penyelesaian) yang privat plus bukti compliance dan selective disclosure (pengungkapan selektif) sehingga mereka bisa memenuhi kewajibannya tanpa ledger publik membocorkan setiap nasabah. Kami adalah rail-nya (jalur pembayaran), bukan lapisan KYC.

**6. Kalau pengadilan memerintahkan kalian mengungkap transaksi user tertentu, bisakah kalian melakukannya?**
Dua lapis. Anchor berlisensi tahu identitas ber-KYC di ujung. Dan regulator bisa mendaftarkan audit request (permintaan audit) yang wajib dijawab oleh holder (pemegang), yang ditegakkan oleh contract. Jujurnya, penegakan pamungkas tetap ada di anchor dan proses hukum; protokol membuat pengungkapan menjadi mungkin dan bisa dibuktikan, tapi tidak menggantikan surat perintah pengadilan.

**7. Siapa yang mengelola allow-list (daftar alamat yang diizinkan), dan apa yang mencegahnya menjadi alat sensor?**
Operator compliance berlisensi yang mengelolanya, dan ya, itu memang titik gerbang (gatekeeping) yang disengaja; justru itulah yang membedakan kami dari mixer permissionless (pencampur dana tanpa izin). Tata kelola daftar itu adalah pertanyaan produksi yang nyata, dan itu jenis hal yang harus disetujui oleh mitra anchor dan regulator, bukan oleh kami sendiri.

## Keamanan dan kunci

**8. Siapa yang memegang admin key pool-nya? Bagaimana kalau operatornya jahat?**
Ada operator key yang mengatur policy (kebijakan), dan penulisan admin ditandatangani secara offline, tidak pernah di browser. Di demo itu satu kunci; di produksi seharusnya multisig (tanda tangan banyak pihak) atau governance (tata kelola). Operator yang jahat bisa mengubah policy tapi tidak bisa memalsukan proof (bukti) atau mengambil dana yang di-escrow di luar aturan contract. Key governance adalah langkah pengerasan (hardening) yang sudah kami sebut secara eksplisit.

**9. Bagaimana cerita trusted setup (setup terpercaya) kalian, dan bagaimana kalau itu sudah dikompromikan?**
Groth16 butuh setup per-circuit. Fase satu adalah powers-of-tau Hermez yang dipercaya seluruh ekosistem. Fase dua adalah ceremony (upacara pembangkitan kunci) kami sendiri, tiga kontribusi plus public beacon (nilai acak publik), byte-identical (identik byte demi byte) dengan transkrip yang sudah di-commit. Celah jujurnya: kami menjalankan ronde-rondenya di satu mesin, jadi kontributor yang benar-benar independen adalah langkah pertama yang perlu didanai.

**10. Ini belum diaudit. Seberapa besar attack surface (permukaan serangan) contract-nya?**
Betul, belum diaudit secara profesional. Ia sudah diperkeras lewat banyak ronde self-review adversarial (peninjauan sendiri secara menyerang) terhadap threat model (model ancaman) yang terdokumentasi, dengan 52 contract test yang lulus. Audit profesional adalah penggunaan pertama dari uang hadiah atau grant.

**11. Apa yang mencegah kebocoran metadata, yaitu mengaitkan sebuah deposit dengan sebuah withdrawal lewat waktu atau jumlah?**
Crossing (transaksi silang di dalam) menyembunyikan jumlah dan kedua pihak, tapi deposit dan withdrawal bersifat publik di kedua ujung secara sengaja, jadi keterhubungan (linkability) mengecil seiring bertambahnya anonymity set (kumpulan anonim). Korelasi waktu dan jumlah di ujung adalah keterbatasan yang sudah diketahui, dan mitigasi seperti fixed denomination (pecahan tetap) serta settlement delay (jeda penyelesaian) ada di roadmap.

## Skala dan ekonomi

**12. Berapa transaksi per detik, dan apa batas proving serta tree-nya?**
Proving (pembuatan bukti) beberapa detik di sisi klien, yang cukup untuk aksi mengirim uang. Tree (pohon Merkle) sekarang kedalaman 10 dan bisa diperluas. Throughput dibatasi oleh Soroban, bukan oleh kami, dan bukan bottleneck (penghambat) pada skala pilot. Tree yang lebih dalam dan batching (pemrosesan berkelompok) adalah tuas skalanya.

**13. Berapa biaya on-chain per transfer, dan siapa yang bayar gas?**
Fee Soroban adalah pecahan sen; verifikasi pairing adalah biaya utama. User yang bayar, atau fee bisa disponsori oleh relayer lewat fee-bump native Stellar (mekanisme menaikkan/menanggung biaya bawaan Stellar), yang sudah kami buktikan di testnet.

**14. Bagaimana unit economics dan margin-nya?**
Take-rate (potongan) tipis, beberapa basis points (per sepuluh ribu) dari volume settlement, dibayar oleh anchor. Begitu satu anchor terintegrasi, biaya marginalnya adalah software, jadi margin kuat; variabel yang sesungguhnya adalah volume corridor.

**15. Seberapa besar anonymity set perlu supaya privasinya benar-benar nyata?**
Privat yang bermakna berarti ratusan atau lebih per epoch (periode) yang berbagi satu pool, dan kamu sampai ke sana lewat mitra distribusi yang mendorong volume nyata ke dalam pool bersama. Skala demo kecil, kami mengatakannya di aplikasi dan menampilkan ukuran set-nya supaya tidak ada yang tersesatkan.

## Produk, go-to-market, dan recovery

**16. Corridor mana persisnya dan anchor mana lebih dulu, dan kenapa yang itu?**
Terserah kamu yang menyebutnya; logikanya adalah jalur bervolume tinggi dan berbiaya tinggi di mana anchor berlisensi sudah beroperasi, jadi rasa sakit fee-nya paling besar dan ujung fiat-nya sudah ada.

**17. Apa yang mencegah anchor memotong kalian dan membangun ini sendiri?**
Moat-nya adalah stack compliance-dan-privasi, tujuh circuit, empat tipe disclosure, audit registry (daftar audit), yang merupakan setahun kerja, bukan pekerjaan satu sore tim produk anchor. Dan kami adalah rail netral lintas banyak anchor, jadi tidak ada satu pun yang memilikinya. Ini risiko nyata yang kami jawab dengan bergerak cepat dan tetap multi-anchor.

**18. Apakah ada token?**
Tidak. Pendapatan berasal dari fee atas settlement. Tanpa token, semuanya tetap sederhana dan menghindari seluruh lapisan kerumitan regulatori.

**19. Apa rencana 6 bulannya?**
Audit, lalu ceremony trusted-setup yang benar-benar terdistribusi, lalu satu pilot bersama anchor berlisensi yang hidup di satu corridor, dan mengukur penggunaan nyata serta pertumbuhan anonymity set. Itu juga cerita milestone untuk Stellar Community Fund.

**20. Apa yang terjadi kalau user kehilangan claim note-nya atau sebuah transaksi gagal?**
Claim note (nota klaim) adalah bearer instrument (instrumen atas tunjuk, siapa yang pegang dia yang berhak), jadi kehilangannya seperti kehilangan uang tunai, yang merupakan risiko UX nyata, dan produksi menambah mode claim-to-address opsional atau custodial recovery (pemulihan lewat kustodian). Transaksi yang gagal tidak menghilangkan dana; deposit bersifat atomik on-chain dan escrow hanya dilepas sesuai aturan contract.

---

## Langkah saat kamu dapat pertanyaan yang tidak bisa kamu jawab sepenuhnya
Sebutkan celahnya dengan jujur, katakan apa yang akan kamu lakukan soal itu, dan kaitkan dengan ask (permintaan pendanaan). "Itu persis jenis hal yang jadi tujuan uang pilot dan audit." Juri lebih memercayai tim yang tahu celahnya sendiri ketimbang yang pura-pura tidak ada celah sama sekali.

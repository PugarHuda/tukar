# Narasi deck Tukar, slide per slide

Panduan baca untuk presentasi `TUKAR_SCF_DECK.pptx` (19 slide, Bahasa Indonesia). Tiap slide di
bawah punya empat bagian: **tujuan** slide itu, **yang dikatakan**, **yang ditunjuk** di layar, dan
**jangan** (jebakan yang bikin klaim jadi tidak jujur atau tidak bisa dipertahankan).

Kalimat di bagian "yang dikatakan" sama dengan catatan pembicara di dalam file PPTX, jadi kamu bisa
pakai yang mana saja. Jangan dihafal kata per kata. Yang penting dua hal per slide: satu kalimat inti
dan satu bukti yang bisa dibuka orang lain.

## Sebelum mulai

- **Pasang tiga font ini di laptop yang dipakai presentasi**: Saira Stencil One, Barlow, Courier
  Prime. Ketiganya gratis di Google Fonts. Font tidak ditanam di dalam file, jadi tanpa itu tampilan
  deck jatuh ke font pengganti.
- **Slide 2 berisi video tertanam** (`demo-live.mp4`, 1 menit 45 detik). Video tertanam hanya jalan
  di PowerPoint atau Keynote desktop. Kalau presentasi lewat Google Slides atau browser, buka
  cadangannya di https://tukar-six.vercel.app/demo-live.mp4 dan versi panjangnya di
  https://tukar-six.vercel.app/demo-id.mp4
- **Siapkan satu tab browser** di https://tukar-six.vercel.app/verify untuk jaga-jaga kalau ada yang
  minta verifikasi resi langsung.
- Kalau internet mati, deck tetap utuh: semua tangkapan layar sudah ada di dalam file.

## Anggaran waktu

| Situasi | Slide | Perkiraan |
|---|---|---|
| Versi lengkap | 1 sampai 19 | 11 sampai 13 menit, termasuk video 1:45 |
| Versi 5 menit | 1, 2, 7, 12, 14, 19 | video dipotong di menit pertama |
| Versi 3 menit tanpa video | 1, 7, 12, 14, 19 | sebut saja videonya ada di tautan |

---

## 01 · Label pengiriman

**Tujuan.** Menaruh posisi dan status di kalimat pertama, sebelum ada yang menebak.

**Yang dikatakan.** Orang yang kerja di luar negeri kirim uang ke rumah tiap bulan, dan biayanya
masih sekitar enam persen. Tukar bikin itu privat, di atas Stellar. Dolar masuk, uang lokal keluar,
dan bagian tengahnya tetap tertutup. Privat di tengah, akuntabel di tepinya. Statusnya disebut
duluan: ini testnet, pra-mainnet, belum diaudit, belum ada pengguna.

**Yang ditunjuk.** Field DARI dan KE yang diredaksi, lalu stempel TESTNET SAJA di pojok.

**Jangan.** Jangan menunda kalimat "belum ada pengguna" ke slide belakang. Kalau juri mendengarnya
dari kamu duluan, sisa presentasi dibaca sebagai jujur. Kalau mereka menemukannya sendiri, semua
klaim lain ikut dicurigai.

## 02 · Lihat langsung (video)

**Tujuan.** Membuktikan produknya ada sebelum bicara arsitektur.

**Yang dikatakan.** Saya tunjukkan langsung, ini live di Stellar testnet. Sender dan Receiver itu
aplikasi konsumen di ponsel, Regulator dan Operator konsol desktop. Seseorang kirim uang ke rumah,
proof kepatuhannya dibangun di ponsel, deposit USDC sungguhan masuk ke shielded pool, lalu keluar
claim note. Keluarganya cairkan pakai kurs on-chain. Regulator memverifikasi ulang resinya, dan
hasilnya terikat ke deposit on-chain yang nyata. Ubah satu karakter, verifier live menolaknya.

**Yang ditunjuk.** Dua momen saja: saat resi dinyatakan terikat ke state on-chain, dan saat resi yang
diubah ditolak.

**Jangan.** Jangan bicara sepanjang video. Diam di dua momen itu dan biarkan layar yang bicara.

## 03 · Ledger-nya terbuka

**Tujuan.** Menjelaskan masalahnya dengan angka publik, bukan dengan dramatisasi.

**Yang dikatakan.** Stellar memindahkan uang sungguhan, tapi ledger-nya publik. Tiap pembayaran
memperlihatkan nominal dan kedua orangnya, dan itu riwayat keuangan pribadi yang terpampang.
Pasarnya nyata: sekitar 669 miliar dolar masuk ke negara berpendapatan rendah dan menengah pada
2023, dan mengirim 200 dolar masih memakan lebih dari enam persen.

**Yang ditunjuk.** Dua angka World Bank itu, lalu baris perbandingan biaya di tangkapan layar.

**Jangan.** Jangan menambah angka pasar lain. Hanya dua angka itu yang punya sumber di dokumen.

## 04 · Masuk publik, lintas privat, keluar publik

**Tujuan.** Menjelaskan bentuk sistemnya dalam tiga langkah.

**Yang dikatakan.** Alurnya dibelah. Deposit-nya publik dan membawa proof kepatuhan. Lintasannya
privat, nominal dan kedua pihak tersembunyi. Off-ramp-nya publik lagi, ke mata uang lokal. Deposit
dan withdraw memang publik di tepinya, itu memang bentuk Privacy Pools. Yang ter-shield adalah
lintasan di antaranya.

**Yang ditunjuk.** Diagram arsitektur, dari kiri ke kanan, sekali jalan.

**Jangan.** Jangan bilang "semuanya privat". Yang privat cuma bagian tengah, dan juri teknis akan
langsung menguji kalimat itu.

## 05 · Produknya, di perangkat yang memang dipakai

**Tujuan.** Menunjukkan ini produk konsumen, bukan demo untuk developer.

**Yang dikatakan.** Perangkat utamanya ponsel dengan koneksi jelek. Proof kepatuhan dibangun
langsung di ponsel, membuktikan pengirim ada di allow-list dan tidak kena sanksi. Lalu deposit USDC
sungguhan masuk ke shielded pool dan keluar claim note. Di rumah, keluarganya menempel note itu dan
mencairkan dengan kurs live yang dibaca on-chain dari Reflector, median lima record, dengan lantai
yang menutup diri kalau harganya jelek.

**Yang ditunjuk.** Tiga tangkapan layar 390 piksel, dan sebut bahwa proving di ponsel memang makan
20 sampai 60 detik.

**Jangan.** Jangan menyembunyikan lama proving. Itu justru bukti prosesnya berjalan di perangkat,
bukan di server kita.

## 06 · Sepuluh negara tujuan

**Tujuan.** Menegaskan ini produk global.

**Yang dikatakan.** Koridornya membayar ke sepuluh negara di Amerika Latin, Asia, dan Afrika. Ini
produk global, bukan cuma Indonesia. Jalur pertamanya Amerika Serikat ke Filipina, karena kedua
kakinya terverifikasi di daftar negara anchor yang dipublikasikan. Arab Saudi ke Indonesia jadi
jalur kedua.

**Yang ditunjuk.** Daftar negara, lalu catatan bahwa kurs on-chain baru untuk empat koridor.

**Jangan.** Jangan menyebut satu pun anchor sebagai mitra. Belum ada yang dihubungi.

## 07 · Jawaban yang terikat ke permintaannya

**Tujuan.** Ini slide paling penting. Klaim terkuat, dan batasnya, di halaman yang sama.

**Yang dikatakan.** Selective disclosure sendirian membiarkan pemegang note memilih apa yang dibuka,
jadi regulator yang minta total bisa dijawab dengan potongan yang enak dilihat. Di Tukar, auditor
mendaftarkan permintaannya on-chain, dan pool menolak jawaban untuk permintaan yang tidak pernah
didaftarkan. Batasnya begini: himpunan yang didaftarkan dibangun dari deposit yang memang sudah
publik. Jadi ini completeness atas pembayaran yang sebenarnya sudah bisa didaftar auditor dari
chain, dan belum completeness atas seluruh cash-out satu orang di semua alamat yang dia pakai.

**Yang ditunjuk.** `register_audit_request`, lalu error `UnknownAuditRequest` nomor 15, lalu kotak
batas di bawahnya.

**Jangan.** Jangan berhenti di kalimat klaim. Batasnya harus keluar dari mulutmu, bukan dari
pertanyaan juri. Dua batas pool live juga disebut: peran auditor masih demo key, dan cap belum
terikat.

## 08 · Empat disclosure, tiap jenis punya kontraknya

**Tujuan.** Menunjukkan bagian yang membuatnya patuh, bukan sekadar privat.

**Yang dikatakan.** Pemegang note membuktikan satu fakta soal pembayarannya lalu mengekspor resi.
Regulator memverifikasi ulang, di browser dan di kontrak Stellar yang live. Hasilnya valid dan
terikat ke deposit on-chain yang nyata, bukan tangkapan layar. Lalu ubah satu karakter, dan verifier
live menolaknya on-chain. Disclosure terverifikasi sendirian bukan hal unik, Stellar Private
Payments juga memverifikasi disclosure.

**Yang ditunjuk.** Empat jenis disclosure, lalu tiga preset ekspor: PPATK LTKL, BSP 1108, EU TFR.

**Jangan.** Jangan mengklaim ini satu-satunya di Stellar. Yang belum ditemukan di proyek lain adalah
pengikatan jawaban ke himpunan yang didaftarkan auditor, bukan verifikasinya.

## 09, 10, 11 · Semua yang sudah jalan, tiga bagian

**Tujuan.** Menjawab "sebenarnya apa saja yang sudah ada" tanpa membuat juri menebak.

**Yang dikatakan.** Slide 9: koridor ter-shield dan permukaan kepatuhan. Tiga hal ada di preview
track, belum di pool live, yaitu pool enforcement, akumulator liabilitas eksak, dan timelock admin.
Menerapkannya ke pool live butuh migrasi state, dan itu Tranche #1. Node TRISA sudah ditulis tapi
belum di-deploy. Slide 10: tepi uang dan konsol operator. Dua hal disebut keras, SEP stack-nya
protokol sungguhan tetapi terhadap anchor rujukan SDF yang tidak punya KYC dan tidak membayarkan
fiat nyata, dan semua ambang alert sengaja dikosongkan karena belum ada trafik untuk jadi baseline.
Slide 11: keluarga disclosure dan kenyamanan pengguna. Dua catatan jujur, idOS memverifikasi
kredensial tetapi tidak bisa mengikatnya ke alamat Stellar sehingga tidak menambah siapa pun ke
allow-list, dan sign-in passkey dimatikan karena library-nya tidak bisa membaca data transaksi
Protocol 28 di SDK yang dipakai sekarang.

**Yang ditunjuk.** Penanda PREVIEW TRACK, BELUM DI-DEPLOY, SEBAGIAN, dan DIMATIKAN. Penanda itu yang
bikin daftar ini kredibel.

**Jangan.** Jangan membaca semua item satu per satu. Sebut kelompoknya, lalu tunjuk penandanya, lalu
lanjut.

## 12 · Yang sudah jalan di testnet

**Tujuan.** Angka yang bisa dicek, bukan kesan.

**Yang dikatakan.** Delapan circuit zero-knowledge, lima belas kontrak Soroban, delapan kontrak
verifier BN254, live di testnet. Tiap proof dibangun di browser dan diverifikasi on-chain. Angka
test-nya dihasilkan dengan benar-benar menjalankan suite-nya pada 15 September, bukan dari
menghitung atribut test di source.

**Yang ditunjuk.** 333 test kontrak dan 295 test frontend.

**Jangan.** Jangan menyebut angka lama dari skrip pitch lama (7 circuit, 8 kontrak, 314 test).

## 13 · Jejak on-chain yang didaftarkan

**Tujuan.** Memberi juri sesuatu yang bisa mereka buka sendiri saat itu juga.

**Yang dikatakan.** Semua alamat kontrak di sini bisa dibuka di stellar.expert. Ini jejak on-chain
yang didaftarkan sesuai Official Rules SCF, dan akan diperbarui kalau berubah secara material.
Identitas mainnet baru didaftarkan saat deployment Tranche #3.

**Yang ditunjuk.** Alamat pool, lalu satu alamat verifier.

**Jangan.** Jangan membacakan alamatnya. Cukup bilang semuanya bisa dibuka.

## 14 · Belum ada pengguna, belum ada volume

**Tujuan.** Menyatakan kelemahan sebagai posisi, bukan sebagai kebocoran.

**Yang dikatakan.** Belum ada pengguna dan belum ada volume, Tukar masih pra-mainnet. Semua
transaksi di identitas yang didaftarkan dikirim oleh tim atau penguji yang tim undang. Tidak ada
yang sintetis, wash, atau sybil, dan tidak satu pun dari itu traksi. Belum diaudit secara
profesional, tepi fiatnya berjalan terhadap anchor rujukan SDF, dan tidak ada yang di sini didukung
atau diperiksa SDF maupun SCF.

**Yang ditunjuk.** Stempel PRA-MAINNET.

**Jangan.** Jangan melunakkan kalimat ini, dan jangan menambahkan janji pengguna yang akan datang.

## 15 · Temuan soal anchor

**Tujuan.** Menunjukkan ketergantungan terbesar sudah diteliti, bukan diasumsikan.

**Yang dikatakan.** Ketergantungan paling rapuh di koridor ini adalah tepi fiat berlisensi, jadi itu
diteliti. Temuannya batasan nyata untuk rencana ini, dan ditulis sebagai temuan, bukan permintaan
maaf. Itu sebabnya deliverable anchor diberi harga dengan engineer integrasi terkontrak, dan
sebabnya jalur pertamanya disebut namanya.

**Yang ditunjuk.** Baris MoneyGram, lalu kalimat bahwa belum ada anchor yang dihubungi.

**Jangan.** Jangan menyiratkan ada pembicaraan yang sedang berjalan.

## 16 · Yang diakui Tukar, baru yang tersisa

**Tujuan.** Mengakui tetangga sebelum mengklaim pembeda.

**Yang dikatakan.** Compliant shielded pool itu primitif bersama di Stellar, bukan milik kami.
Implementasi rujukan SDF sendiri punya satu, award terdekat yang sudah didanai memang didanai untuk
membangun satu, dan pola verifier Tukar diadaptasi dari referensi Nethermind. Yang tersisa adalah
koridor di atas pool itu, dan isinya empat hal yang semuanya bisa dicek di repositori.

**Yang ditunjuk.** Empat sumbu pembeda.

**Jangan.** Jangan mengklaim unggul dari Remi dalam traksi. Mereka lebih dulu didanai dan punya
distribusi yang kita tidak punya.

## 17 · Yang diminta

**Tujuan.** Menjelaskan angka dan ketidakcocokannya secara terbuka.

**Yang dikatakan.** Yang diminta 120.100 dolar untuk enam bulan, sekitar delapan puluh persen dari
plafon. Pembagian pembayarannya sudah dipatok SCF di sepuluh, dua puluh, tiga puluh, empat puluh.
Basis biayanya tidak jatuh dengan rasio itu, dan grafiknya menunjukkan itu daripada
menyembunyikannya, supaya reviewer bisa mendebat inputnya, bukan totalnya.

**Yang ditunjuk.** Grafik biaya per tranche dibanding pembayarannya.

**Jangan.** Jangan menghindar kalau ditanya soal Tranche #2. Jawabannya ada di bawah, di bagian
pertanyaan.

## 18 · Sebelas deliverable dengan syarat selesainya

**Tujuan.** Menunjukkan uangnya terikat ke hasil yang bisa diperiksa.

**Yang dikatakan.** Sebelas deliverable, masing-masing punya biaya dan syarat selesainya.
Pekerjaannya memproduksionalkan arsitektur yang sudah jalan, bukan membangun dari nol. Kalau SDF
membatasi award ini ke testnet saja, tiap deliverable Tranche #3 punya bentuk testnet yang tetap
memegang syarat selesainya, dan dua hal benar-benar hilang, tidak ditutup-tutupi.

**Yang ditunjuk.** Satu deliverable saja sebagai contoh syarat selesai, misalnya D1.1.

**Jangan.** Jangan membacakan sebelasnya.

## 19 · Penutup

**Tujuan.** Menutup dengan kalimat posisi dan undangan memeriksa.

**Yang dikatakan.** Itu Tukar. Privat di tengah, akuntabel di tepinya, di atas Stellar. Masih testnet
dan belum diaudit, belum ada pengguna dan belum ada volume, tapi semua yang di tengah itu nyata dan
bisa diverifikasi on-chain sekarang juga. Proposal ini mendanai produksionalisasi arsitektur yang
sudah jalan, bukan membangunnya dari nol. Terima kasih.

**Yang ditunjuk.** Empat tautan di slide.

**Jangan.** Jangan menambahkan janji penutup yang tidak ada di dokumen.

---

## Pertanyaan yang kemungkinan besar datang

**"Klaim completeness kalian sebenarnya seberapa kuat?"** Jawab persis seperti slide 7. Jawaban
terikat ke himpunan commitment yang didaftarkan auditor, jadi pembayaran di dalam himpunan itu tidak
bisa dihilangkan. Himpunan itu dibangun dari deposit yang sudah publik, jadi ini belum completeness
atas cash-out satu orang di semua alamatnya. Itu pekerjaan berikutnya, dan tidak diklaim sudah ada.

**"Kenapa Tranche #2 biayanya jauh lebih besar dari pembayarannya?"** Karena hampir semua engagement
kontraktor jatuh di situ. Biaya per tranche 13.125, 52.125, dan 54.850 dolar, sementara
pembayarannya 12.010, 24.020, 36.030, dan 48.040. Dua syarat yang membuatnya tetap sehat: gaji
founder untuk satu tranche baru diambil setelah pembayaran tranche itu cair, dan tiap kontraktor
dibayar dua tahap dengan sisanya menunggu pembayaran tranche. Setelah tiap pembayaran, kas tidak
pernah negatif.

**"Sudah bicara dengan anchor mana?"** Belum ada satu pun yang dihubungi. Yang ada adalah hasil
penyaringan pada 11 September, dan temuannya tidak ada anchor native Stellar yang membayar rupiah.

**"Ini sudah diaudit?"** Belum. Audit profesional direncanakan terpisah lewat Audit Bank dan jadi
prasyarat sebelum mainnet. Sistemnya membawa peringatan jangan dipakai dengan aset nyata.

**"Kenapa belum ada pengguna?"** Karena produknya belum pernah keluar dari testnet, dan kami tidak
mau mengarang trafik. Pilot dengan tiga penguji di luar tim adalah langkah berikutnya, dan hasilnya
akan dipublikasikan apa adanya, termasuk yang gagal.

**"Bedanya dengan Stellar Private Payments atau Arcane?"** Mereka primitif dan infrastruktur
horizontal. Tukar adalah koridor vertikal di atas primitif itu: tepi fiat lewat SEP, pembayaran ke
mata uang lokal, kurs on-chain sebagai gerbang settlement, dan jawaban audit yang terikat ke
permintaan auditor.

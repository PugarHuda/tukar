# Checklist sebelum submit (catatan internal, BUKAN bagian dari aplikasi)

File ini untuk owner saja. Jangan pernah menempelkan isi file ini ke form SCF.
Jawaban yang dibaca reviewer ada di [`SCF_SUBMISSION.md`](SCF_SUBMISSION.md), dan file itu
sengaja dibersihkan dari semua catatan yang ditujukan ke builder.

Deadline submission: 2026-11-08.

## Yang paling mendesak, dan bukan soal kualitas

**1. Kelayakan sebagai pelamar satu orang. Kirim pertanyaannya hari ini.**

Official Rules 1.1 menyebut program terbuka untuk **Teams of Eligible Individuals** dan
**Organizations**. Individu tidak disebut. Lalu 1.2 mewajibkan Team atau Organization menunjuk
**minimal dua Eligible Individuals** untuk webinar persiapan, bootcamp, dan presentasi di
investor demo day. Dicek langsung ke halaman resminya pada 2026-09-12, dan tidak ada satu
kalimat pun di sana tentang solo builder atau team size 1.

Bukti tandingannya nyata tapi tidak menyelesaikan. Halaman proyek LumenShade di situs SCF
mencantumkan team size 1, award 135.000 dolar, SCF #37, track Applications. Jadi pelamar satu
orang pernah didanai di angka yang sama persis dengan permintaan ini. Tapi itu ronde #37,
sementara handbook baru diperbarui sekitar sebulan lalu.

Teksnya sendiri tidak bisa menjawab ini, dan handbook memang menyuruh yang ragu bertanya. Kirim
sekarang, bukan Oktober: kalau jawabannya dua orang, yang berubah bukan dokumen melainkan
rencananya, dan mencari orang kedua butuh waktu.

Ke communityfund@stellar.org, kira-kira begini:

> Subject: Eligibility question, single-person team, Open Track, SCF #46
>
> Hello,
>
> I am preparing an Open Track submission for SCF #46 and want to check one eligibility point
> before I submit rather than after.
>
> I am building alone. Official Rules 1.1 lists Teams and Organizations as eligible, and 1.2
> asks a Team or Organization to appoint at least two Eligible Individuals for the preparation
> webinars, the bootcamp, and the investor demo day. I could not find wording covering a
> single-person team either way. I did find LumenShade listed on the SCF site with a team size
> of 1 for SCF #37, which is why I am asking rather than assuming the answer is no.
>
> Two questions. Is a single-person team eligible to submit to the Open Track? And if it is,
> how should the two-individual requirement in 1.2 be satisfied?
>
> The project is Tukar, a privacy-preserving remittance corridor on Soroban, currently on
> testnet at https://github.com/PugarHuda/tukar
>
> Thank you,
> Pugar Huda Mantoro

**2. Slot Security Office Hours Runtime Verification, gratis, tutup dalam hitungan hari.**

Lihat `SECURITY_REVIEW_PREP.md`. Sesi pertama 2026-09-15 pukul 14:00 sampai 16:00 UTC. Dari enam
slot, tiga sudah habis. Slot 60 menit terakhir adalah 2A, sisa satu, dan itu yang cocok karena
ukuran basis kode ini melewati ambang 2.000 baris. Waktu lokal 22:00 WIB. Agenda yang sudah
diurutkan ada di file itu, jadi kalau cuma dapat 30 menit, tiga pertanyaan teratas yang terjawab
adalah yang mengubah apa yang dibangun berikutnya.

Skor keamanan dari panel juri adalah angka terendah kita, 3 dari 10. Ini kebetulan yang tepat
waktunya dan tidak berbiaya.

## Status

- [x] Team Description: solo, sudah terisi lengkap (nama, LinkedIn, GitHub, riwayat kerja, prior work)
- [x] Evidence "built and scaled before" (Open Track): sudah ditulis jujur. Building: ya, berulang, solo, tiga di antaranya di domain privacy (Sealed Pair, Diam, Turu). Scaling: tidak ada, dan itu dinyatakan terang-terangan, bukan disamarkan. **Jangan diubah jadi lebih tebal.**
- [x] Threat model + monitoring plan: sudah di-INLINE penuh di SCF_SUBMISSION.md (STRIDE index 16 baris + tabel sinyal monitoring + coverage gaps). Reviewer tidak perlu buka repo.
- [x] Competitive differentiation: sudah di-INLINE (Arcane, Remi, Fairblock, Moonlight, Stellar Private Payments) sebagai satu field sendiri.
- [x] Contract addresses: sudah di-INLINE (15 kontrak + USDC SAC + wallet operasional) di field Current Traction.
- [x] Angka tes cargo: dihitung ulang 2026-09-12 dengan menjalankan `cargo test` per crate. 333 total (pool 55, pool-enforced 82, pool-accumulator 83, pool-timelock 89, policy-registry 6, reserves 6, reserves-aggregate 12, reserves-testpool 0). Naik dari 314 lewat tiga gelombang: tes vektor public input transfer dan withdraw plus satu yang memuat WASM verifier asli, gerbang compliance di sisi keluar, lalu pengikatan cap audit dan guard kanonik pada view keanggotaan. Hitung ulang dengan menjalankan suite-nya, bukan dengan menghitung `#[test]`, karena yang kedua ikut menghitung yang di-skip.
- [x] Angka AI disclosure: dihitung ulang 2026-09-12, 246 dari 296 commit (198 Opus 4.8, 25 Opus 4.8 konteks panjang, 14 Opus 5, 5 Fable 5, 4 Opus 5 konteks panjang). Angka ini bergerak, jadi di submission ditulis dengan tanggalnya. **Hitung ulang di hari submit** dengan:
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

## Audit kepatuhan handbook, 2026-09-12: aksi yang hanya bisa dikerjakan owner

Semua aturan di bawah dicek langsung ke halaman handbook yang live pada 2026-09-12
(Submission Criteria, Budget & Deliverable Guidelines, Open Track, Official Rules for
Submissions). Yang bisa diperbaiki lewat teks sudah diperbaiki di `SCF_SUBMISSION.md` dan
`SCF_BUILD_PROPOSAL.md`. Sisanya ada di sini.

- [ ] **Video presentasi tim.** Aturan: daftar "What Makes a Good Open Track Submission",
      baris "Professional video presentation of the team". Ini satu-satunya field yang masih
      kosong di submission dan video demo tidak menggantikannya.
- [ ] **Siapkan wallet award sebelum submit.** Aturan: Official Rules 5.9 (award dibayar dalam
      XLM, SDF tidak punya kewajiban mengganti dana yang hilang atau dicuri). Submission
      sekarang menyatakan secara eksplisit bahwa award wallet adalah akun Stellar baru, di
      bawah multisig, kunci penandatangan di hardware, tidak berbagi key material dengan admin
      koridor maupun relayer. Itu janji tertulis: buat akunnya dan set multisig-nya sebelum
      submit, jangan setelah award cair. Kalau owner tidak mau berkomitmen ke bentuk itu,
      ubah kalimatnya di kedua dokumen, jangan dibiarkan tidak akurat.
- [ ] **Rotasi kunci admin `corredor` yang bocor.** Aturan yang sama (5.9) plus kredibilitas
      D1.3. Submission menyebut kunci itu compromised dan menjadikan penggantiannya sebagai
      deliverable Tranche #1. Rotasi aslinya masih utang owner.
- [ ] **Konfirmasi kesediaan menerima milestone testnet-only.** Aturan: Official Rules 2A
      (SDF boleh mensyaratkan milestone yang dimodifikasi, termasuk membatasi deployment ke
      testnet dan mengeluarkan mainnet launch dari scope award). Founder ada di Indonesia dan
      produknya memindahkan uang, jadi risiko ini nyata. Proposal section 9a dan satu field
      baru di submission sekarang menyatakan Tukar akan menerima milestone yang dimodifikasi
      dan memetakan D3.1 sampai D3.4 ke bentuk testnet-nya. Owner harus benar-benar setuju
      dengan pernyataan itu sebelum submit.
- [ ] **Putuskan baris infrastruktur $9,500.** Aturan: prescreen menolak "ineligible
      expenses", dan handbook mengecualikan "operational overhead". Proposal sendiri sudah
      menandai baris ini sebagai sesuatu yang bisa dibaca sebagai overhead dan menyebut angka
      turunannya ($125,500) kalau dicoret. Keputusan menyimpan atau mencoretnya adalah
      keputusan angka, jadi milik owner. Audit ini tidak mengubah satu angka pun.
- [ ] **Putuskan bagaimana D0.1 dipresentasikan.** Aturan: prescreen menolak "inflated or
      unbalanced budgets". D0.1 dibayar $13,500 dengan cost basis $875. Split 10/20/30/40 itu
      ditetapkan SCF jadi ini bukan pelanggaran, dan sekarang dinyatakan terbuka di Section 5
      dan di submission sebagai modal kerja untuk overhang Tranche #2. Kalau prescreener
      tetap membacanya sebagai tidak seimbang, ini baris yang akan ditanyakan pertama.
- [ ] **Pemetaan field form.** Aturan: panel menilai "based solely on the information provided
      in the submission". Lima blok baru ditambahkan ke `SCF_SUBMISSION.md`: Market analysis
      (sisi bisnis), Budget dan deliverables dengan amount plus kriteria DONE WHEN per
      deliverable, Onchain growth dan cara mengukurnya, kondisi testnet-only 2A, dan custody
      dana award. Kalau form SCF tidak punya field yang cocok, tempelkan ke field terdekat,
      jangan dibuang. Prioritas kalau ada batas karakter: blok Budget dan deliverables tidak
      boleh hilang, karena prescreen menolak "deliverables that don't have a specific budget
      amount associated with them".
- [ ] **Isi tabel deliverable dan budget di form SCF itu sendiri** (bukan hanya di dokumen),
      satu amount per deliverable, persis seperti blok baru di submission.
- [ ] **Konfirmasi lima engagement kontraktor benar-benar bisa diisi dan dibayar** (sudah ada
      di catatan budget di atas, diulang di sini karena Section 8 menyatakan rencana ini tidak
      bisa dikompres balik ke satu orang kalau engagement-nya tidak terisi).
- [ ] **Catatan, bukan aksi: "built and scaled" tetap setengah jawaban.** Aturan: daftar Open
      Track, "Evidence that your team has previously built and scaled similar products".
      Building: ya. Scaling: tidak, dan itu dinyatakan terang-terangan. Ini satu-satunya butir
      daftar Open Track yang tidak bisa dipenuhi, dan **jangan** ditutup dengan bahasa yang
      lebih tebal. Reviewer prescreen menyebut kejujuran ini bagian terkuat dari paket.
- [ ] **Di luar audit ini:** saat audit dijalankan, `README.md`, `docs/COMPETITIVE.md` dan
      `docs/INSTAWARD_SOW.md` sudah dalam keadaan termodifikasi di working tree. Audit ini
      tidak menyentuh ketiganya. Periksa sendiri sebelum commit.

## Yang tidak boleh berubah

- Semua konsesi jujur. Reviewer prescreen menyebut ini bagian terkuat dari paket.
- Angka budget. Sudah dihitung ulang sel per sel dan aritmatikanya tepat.
- Klaim anchor. Belum ada satu pun anchor yang dihubungi (lihat `ANCHOR_OUTREACH.md`:
  "Nothing here has been sent"). Jangan pernah menulis "partnered with", "working with",
  atau menyebut nama kontak orang.

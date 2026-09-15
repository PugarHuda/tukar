# Checklist sebelum submit (catatan internal, BUKAN bagian dari aplikasi)

File ini untuk owner saja. Jangan pernah menempelkan isi file ini ke form SCF.
Jawaban yang dibaca reviewer ada di [`SCF_SUBMISSION.md`](SCF_SUBMISSION.md) (full submission) dan
[`SCF_INTEREST_FORM.md`](SCF_INTEREST_FORM.md) (interest form), dan keduanya sengaja dibersihkan
dari semua catatan yang ditujukan ke builder.

## Status sebenarnya per 2026-09-15: belum ada undangan

Interest form Tukar dikirim 2026-08-14 (Open Track, Submitter type "Individual", Team Description
satu baris, Referral "Yes", kode referral tidak terlihat di salinan data yang dikirim balik). Pada
2026-08-24 communityfund@stellar.org membalas bahwa proyek "does not meet the requirements for the
Stellar Community Fund Build Award", tanpa feedback spesifik. Email itu menyuruh membaca Submission
Criteria sebelum mengirim ulang interest form, menyarankan Stellar Ambassador Program, dan meminta
bergabung ke #scf-general di Stellar Developers Discord. Kedua email ada di Gmail owner.

Akibatnya:

- Full submission tidak bisa dikirim. Handbook: "Eligible teams will be invited to submit to an
  upcoming Build round", undangan datang lewat email beserta deadline rondenya.
- Deadline 2026-11-08 yang dulu ditulis di sini bukan target realistis. Review interest form
  kemarin makan 10 hari, lalu masih harus menunggu undangan.
- Jangan terburu-buru. Resubmission policy: proyek yang ditolak tiga kali diblokir tiga ronde.

## Urutan kerja

**1. Minggu ini.**

- [ ] Jalankan Instaward lewat Ambassador Chapter Indonesia (Kenny). Ini persis jalur yang
      disarankan email penolakan, dan handbook Open Track sendiri menulis builder yang belum
      cukup berpengalaman "Better fit for Instawards". SOW ada di `INSTAWARD_SOW.md`.
- [ ] Kirim email kelayakan (draft di bawah).
- [ ] Gabung #scf-general di Stellar Developers Discord. Open Track diputuskan juga lewat
      Community Vote (Neural Quorum Governance), jadi kehadiran di komunitas ikut dihitung.
- [ ] Security Office Hours Runtime Verification, 2026-09-15 pukul 14:00 sampai 16:00 UTC
      (21:00 sampai 23:00 WIB). Di Gmail dan Calendar tidak ada konfirmasi booking. Kalau sudah
      lewat, catat, dan pakai sesi berikutnya. Agenda ada di `SECURITY_REVIEW_PREP.md`.

**2. Selama sprint Instaward (mulai 2026-09-22).**

- [ ] D1 ledger, pilot tiga penguji, spec. Hasil pilot adalah traksi pertama yang bisa diverifikasi.
- [ ] Rotasi kunci admin `corredor` yang bocor, lalu pindahkan role auditor dari demo key.
- [ ] Rekam video presentasi tim (wajib untuk Open Track, video demo tidak menggantikannya).
- [ ] Kalau memungkinkan, cari orang kedua. Official Rules 1.2 meminta minimal dua Eligible
      Individuals untuk webinar, bootcamp, dan demo day.

**3. Kirim ulang interest form, setelah Instaward selesai.**

- [ ] Pakai `SCF_INTEREST_FORM.md`. Sebelum menempel, perbarui status Instaward (disetujui atau
      tidak, selesai atau tidak), hasil pilot yang benar-benar terjadi, dan angka tes hari itu.
- [ ] Kode referral REF-RISEI-449 wajib terisi, jangan hanya "Yes".
- [ ] Submitter type tetap "Individual" kecuali orang kedua benar-benar bergabung.
- [ ] Isi juga form referral terpisah dari Kenny:
      https://docs.google.com/forms/d/e/1FAIpQLSfMWF9cALLvIY_RLUagBbmE7abviwdTckxpkqTdvsdMxqhdUg/viewform
      dengan kode yang sama. Platform referrer: https://raven.stellar.buzz/

**4. Kalau diundang, full submission.** Lihat bagian budget dan janji di bawah.

## Email kelayakan, kirim sekarang

Official Rules 1.1 menyebut program terbuka untuk Teams dan Organizations, dan 1.2 meminta minimal
dua Eligible Individuals. Tapi halaman Build Award, bagian KYC, menulis "If applying as an
individual: you must complete the form", dan LumenShade (SCF #37) tercatat dengan team size 1.
Teks handbook tidak menjawab ini, jadi tanyakan.

Ke communityfund@stellar.org:

> Subject: Eligibility question, single-person team, Open Track
>
> Hello,
>
> I am preparing to resubmit the SCF Build interest form for Tukar, a privacy-preserving
> remittance corridor on Soroban (https://github.com/PugarHuda/tukar), and want to check three
> points before I do.
>
> First, eligibility. I am building alone. Official Rules 1.1 lists Teams and Organizations, and
> 1.2 asks a Team or Organization to appoint at least two Eligible Individuals for the preparation
> webinars, the bootcamp and the investor demo day. The Build Award page, in its KYC section, says
> "If applying as an individual: you must complete the form", and LumenShade is listed on the SCF
> site with a team size of 1 for SCF #37. Is a single-person team eligible for the Open Track, and
> if so, how should the two-individual requirement in 1.2 be met?
>
> Second, budget structure. Should each deliverable's amount be what that deliverable costs, with
> the 10/20/30/40 payments following from the total, or should the deliverable amounts inside each
> tranche add up to that tranche's payment?
>
> Third, my interest form of 2026-08-14 was declined. I am working with Stellar Ambassador Chapter
> Indonesia on an Instaward first. Is there a recommended gap before resubmitting the interest
> form?
>
> Thank you,
> Pugar Huda Mantoro

## Budget $120,100: yang sudah diputuskan

Per 2026-09-15 request turun dari $135,000 ke **$120,100**, sekitar 80% cap. Caranya:

- Rate founder $1,750/minggu dan 26 minggu **tidak diubah**.
- Biaya running (hosting, RPC berbayar, datastore indexer, endpoint dan sertifikat TRISA, CI,
  reserve mainnet, sekitar $9,500 selama 6 bulan) **tidak lagi ditagihkan**, karena handbook
  mengecualikan "operational overhead". Biayanya tetap ada dan ditanggung proyek di luar award.
- Blok desain untuk alur anchor (3 minggu, $5,400) dihapus. Layar KYC dan deposit alur anchor
  dikerjakan founder. Desain hanya dibeli untuk dokumen integrasi SDK (D3.3).
- TRISA dipindah dari Tranche #2 ke Tranche #3 dan sekarang berlabel D3.5. Label lain ikut
  bergeser: monitoring jadi D2.2, pilot jadi D2.3.
- D0.1 sudah dihapus sebelumnya. Amount tiap deliverable sama dengan biaya riilnya.

Hasilnya:

| | Tranche #0 | Tranche #1 | Tranche #2 | Tranche #3 |
|---|---:|---:|---:|---:|
| Biaya deliverable | $0 | $13,125 | $52,125 | $54,850 |
| Pembayaran SCF | $12,010 | $24,020 | $36,030 | $48,040 |
| Kas saat tranche mulai | | $12,010 | $22,905 | $6,810 |
| Kas setelah tranche dibayar | $12,010 | $22,905 | $6,810 | $0 |

Kas tidak pernah negatif setelah pembayaran. Kalau TRISA tetap di Tranche #2, Tranche #2 kurang
$9,815 bahkan setelah dibayar.

Pengurangan lain yang sudah dihitung, kalau panel minta lebih kecil: $98,600 (rate founder pakai
gaji pasar Indonesia), $109,100 (ceremony dicoret, paling buruk), $114,700 (desain dicoret).

## Budget: yang harus kamu konfirmasi

- [ ] **Dua syarat pembayaran yang sekarang tertulis di dokumen atas nama kamu.** Keduanya yang
      membuat tabel di atas benar.
      (1) Gaji founder untuk satu tranche diambil setelah pembayaran tranche itu cair. Artinya
      kamu menalangi gaji sendiri sampai sekitar 11 minggu, di Tranche #3.
      (2) Setiap kontraktor dibayar dua tahap, tahap pertama dari kas yang ada saat mulai, sisanya
      saat pembayaran tranche yang memuat pekerjaannya cair. Kontraktor yang tidak mau syarat ini
      tidak dipakai, dan deliverable-nya bergeser sesuai Section 8 proposal.
      Kalau salah satu tidak bisa kamu jalani, bilang, karena kasnya jadi negatif lagi.
- [ ] Biaya running sekitar $9,500 selama 6 bulan sekarang dibayar dari luar award. Pastikan
      sanggup.
- [ ] Rate founder $1,750/minggu dan kesediaan benar-benar keluar dari SmartID selama 6 bulan.
- [ ] Lima engagement kontraktor benar-benar bisa dicari, dengan syarat dua tahap di atas.
- [ ] Setuju dengan pernyataan menerima milestone testnet-only (Official Rules 2A).
- [ ] **Siapa yang pernah bertransaksi di kontrak kita?** Submission, proposal, dan interest form
      menulis "submitted by the team or by testers the team invited". SOW Instaward menulis
      proyek "has never been used by anyone except its author". Dua-duanya tidak bisa benar
      sekaligus, dan repo tidak punya bukti tester undangan. Kalau memang tidak pernah ada,
      hapus frasa "or by testers the team invited" di ketiga dokumen. Kalau pernah ada, ubah
      kalimat SOW.
- [ ] Konfirmasi tidak ada pendanaan lain yang harus diungkap selain Instaward (misalnya hadiah
      hackathon yang dibayar SDF). Field "Other funding" di submission hanya menyebut Instaward.

## Janji di dokumen yang harus benar sebelum submit

- [ ] Wallet award baru, multisig, kunci di hardware, tidak berbagi key material dengan admin
      koridor atau relayer (Official Rules 5.9). Buat sebelum submit.
- [ ] Rotasi kunci admin `corredor` yang bocor (D1.3 dan THREAT_MODEL 3.5).
- [ ] Role auditor di pool live dipindah dari demo key (Repudiation.1).
- [ ] Video presentasi tim terisi (field terakhir yang masih kosong di submission).

## Status materi submission

- [x] Team Description lengkap, dan "built and scaled" dijawab jujur: building ya, scaling tidak.
      **Jangan diubah jadi lebih tebal.**
- [x] Threat model dan monitoring plan di-inline penuh (STRIDE index dan tabel sinyal).
- [x] Competitive differentiation di-inline. Klaim completeness sudah dibatasi 2026-09-15: yang
      diklaim adalah jawaban terikat ke set yang didaftarkan auditor, bukan completeness atas
      cash-out satu orang lintas alamat. Jangan dikembalikan ke klaim lama.
- [x] Bukti kebutuhan (validated need) dari OpenZeppelin, SDF Stellar Private Payments, dan
      catatan meeting SDF 2026-08-06, dikutip dari sumber asli, di field Current Traction.
- [x] Unified documentation dipetakan ke semua yang diminta Open Track, termasuk test plan
      (`TESTING.md`) dan prototipe UI/UX (app yang live, `DESIGN.md`, delapan screenshot).
- [x] Angka tes: dijalankan ulang 2026-09-15 per crate, 333 total (pool 55, pool-enforced 82,
      pool-accumulator 83, pool-timelock 89, policy-registry 6, reserves 6, reserves-aggregate
      12), dan 295 tes frontend di 38 file. Hitung dengan menjalankan suite, bukan menghitung
      `#[test]`.
- [x] Angka AI disclosure bergerak. **Hitung ulang di hari submit** dengan:
      `git log --format="%(trailers:key=Co-Authored-By,valueonly)" | sort | uniq -c`
- [x] Referral: Yes plus kode REF-RISEI-449.
- [ ] Cek batas karakter tiap field. Kalau ada yang terpotong, urutan pemotongan yang aman:
      1. Prosa di field Build Track reasoning.
      2. Tabel kontrak additive dipindah ke field lain, jangan hapus alamat pool dan 8 verifier.
      3. **Jangan pernah** potong konsesi jujur, STRIDE index, tabel sinyal monitoring, atau blok
         Budget dan deliverables (prescreen menolak deliverable tanpa amount).
- [ ] Kalau form tidak punya field untuk Competitive landscape, Market analysis, Other funding,
      2A, atau Custody, tempelkan ke field terdekat. Jangan dibuang.
- [ ] Isi tabel deliverable dan budget langsung di form SCF, satu amount per deliverable.

## Yang tidak boleh berubah

- Semua konsesi jujur.
- Total $120,100 dan komposisinya ($45,500 founder, $74,600 kontraktor), kecuali owner mengubah
  salah satu keputusan di atas.
- Klaim anchor. Belum ada satu pun anchor yang dihubungi (`ANCHOR_OUTREACH.md`: "Nothing here has
  been sent"). Jangan pernah menulis "partnered with", "working with", atau menyebut nama kontak.

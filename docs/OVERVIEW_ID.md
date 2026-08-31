# Tukar, penjelasan lengkap (Bahasa Indonesia)

Versi belajar buat paham proyek sendiri. Istilah teknis dibiarin English karena itu yang
dipakai di pitch (yang di panggung English).

---

## 1. Proyek ini tentang apa

**Tukar = koridor kirim uang lintas negara (remittance) yang PRIVAT tapi tetap bisa diaudit
regulator, dibangun di atas Stellar.**

Ceritanya: jutaan pekerja di luar negeri tiap bulan kirim uang ke keluarga, dan masih bayar
sekitar 6 persen. Crypto rail (stablecoin) bikin itu murah, TAPI di blockchain biasa semua
transaksi publik, jadi siapa-kirim-ke-siapa-berapa kelihatan semua orang. Itu bocorin riwayat
finansial pribadi.

Tukar menyelesaikan itu: **bagian tengah (jumlah + kedua pihak) disembunyikan on-chain, tapi
tetap bisa dibuktikan ke regulator lewat selective disclosure.** Slogannya: *"Private in the
middle, accountable at the edges"* (privat di tengah, akuntabel di ujung).

Kategori lomba: **Payments & Consumer Applications**.

---

## 2. Masalah yang diselesaikan

- Stellar itu **ledger publik**: tiap pembayaran nunjukin **jumlah + pengirim + penerima**.
- Remittance butuh **privasi** (jangan bocorin siapa bayar siapa), TAPI operator berlisensi
  butuh **kepatuhan** (bisa audit, tolak akun tersanksi).
- **Alat privasi biasa (mixer) gak bisa jawab regulator. Dompet biasa publik.** Belum ada yang
  kasih dua-duanya. Itu celah yang diisi Tukar.

---

## 3. Cara kerja garis besar (4 tahap)

1. **Deposit (PUBLIK)** — USDC asli masuk ke pool, dibarengi **compliance proof** (bukti
   pengirim boleh, bukan akun tersanksi).
2. **Crossing (PRIVAT)** — transfer di dalam korridor **menyembunyikan jumlah dan kedua pihak**.
   Yang kelihatan cuma *commitment* dan *nullifier*.
3. **Off-ramp (PUBLIK)** — penerima cairin ke mata uang lokal, kursnya dibaca on-chain dari
   oracle.
4. **Disclosure (SESUAI PERMINTAAN)** — pemegang pembayaran bisa buktiin **satu fakta** ke
   regulator (misalnya jumlahnya), tanpa buka yang lain.

Deposit dan withdraw sengaja publik (model **Privacy Pools**); yang privat cuma *penyeberangan*
di tengah, persis di titik yang gak boleh bocor.

---

## 4. Fitur dan cara kerjanya

### a. Shielded transfer (transfer terlindung) — jantung privasi
- Tiap "uang" jadi **note** yang masuk ke **Merkle tree** sebagai **commitment** (hash rahasia,
  kayak titipan tersegel). Jumlah dan pemilik gak kelihatan.
- Waktu dibelanjakan, note ngeluarin **nullifier** (penanda anti double-spend). Kontrak nolak
  nullifier yang sudah pernah dipakai, jadi gak bisa dibelanjakan dua kali.
- Sirkuit `transfer` (JoinSplit) buktiin: note-nya beneran ada di tree, nilainya seimbang
  (input = output), dan nullifier-nya benar, **tanpa** bukain jumlah atau siapa pihaknya.

### b. Compliance ASP (allow-list + deny-list) — kepatuhan di dalam bukti
- Tiap deposit buktiin di dalam sirkuit bahwa **pengirim ada di allow-list** dan **tidak ada di
  deny-list** (daftar akun tersanksi).
- Kuncinya di-**pin ke akun `from`**, jadi kamu **gak bisa deposit atas nama orang lain**.
- Ini yang bikin Tukar beda dari mixer: kepatuhan itu **di dalam proof, bukan janji**.

### c. Selective disclosure (buka satu fakta saja) — 4 jenis
Pemegang pembayaran bisa buktiin satu hal ke auditor, sisanya tetap rahasia:
1. **Exact** — buktiin jumlah persisnya.
2. **Threshold** — buktiin jumlah **di bawah/sama dengan** suatu batas, tanpa sebut angka pasti.
3. **Range** — buktiin jumlah **di antara dua batas**.
4. **Aggregate** — buktiin **total beberapa pembayaran ≤ suatu cap**. Ini dijaga **registry
   on-chain**: regulator daftarin permintaan audit, dan kontrak (`disclose_aggregate`) **nolak**
   audit yang gak terdaftar, jadi pemegang **gak bisa cherry-pick** (milih-milih pembayaran).
- Tiap disclosure hasilkan **receipt** yang bisa diekspor dan dikasih ke auditor.

### d. Verifikasi on-chain (bukan sekadar klaim)
- Proof dibuat **di browser** (snarkjs/WASM), lalu diverifikasi oleh **kontrak Soroban** di
  Stellar testnet (cek pairing BN254).
- Kalau asli → **valid**. Kalau dipalsukan/diubah → kontrak balikin **InvalidProof**. Ini yang
  ditunjukin di demo (tampered claim ditolak on-chain).

### e. Merkle tree trustless
- Sirkuit `merkleUpdate` buktiin bahwa masukin satu leaf ke `old_root` menghasilkan `new_root`
  yang benar. Artinya tree-nya maju **tanpa backdoor admin**.

### f. Oracle-gated off-ramp (kurs on-chain sebagai pengaman)
- Kurs cash-out dibaca **on-chain dari Reflector oracle** (SEP-40), pakai **median dari 5
  sumber**, jadi satu harga yang dimanipulasi gak bisa nggerakin.
- Withdraw punya **min-receive gate**: pool baca ulang oracle saat settle dan **nolak** kalau
  hasilnya di bawah ~99% quote. Kalau feed basi/hilang, **fail-closed** (gagal aman).
- Jadi dana **gak pernah pindah di harga jelek**.

### g. Fiat edges (ujung fiat) — jujur: masih disimulasi
- On-ramp/off-ramp lewat **SEP-24 anchor**. Di testnet ini pakai reference anchor SDF (belum
  KYC/fiat asli). Produksi butuh **anchor berlisensi** yang urus KYC. Ini langkah bisnis, bukan
  masalah kode.

### h. In-browser proving (bukti di HP)
- Semua proof dibikin **di perangkat pengguna** (WASM), jadi **rahasia gak pernah keluar HP**.
  Cukup beberapa detik, wajar buat kirim uang.

### i. Dompet: testnet key bawaan atau Freighter
- **Built-in testnet key**: satu klik, **tanpa seed phrase**, langsung transaksi testnet asli
  (buat coba/demo). Karena dipakai bareng, ada hint buat **connect Freighter** kalau rame-rame.
- **Freighter**: dompet sendiri, tanda tangan sendiri.

### j. Tambahan
- **Anonymity set** ditampilkan (seberapa banyak note buat "bersembunyi"; privasi naik seiring
  pemakaian pool).
- **Gasless (fee-bump, CAP-15)**: fee bisa disponsori relayer. Sudah dibuktikan di testnet
  sebagai primitif, tapi belum jadi default aplikasi (jujur).
- **10 koridor**: IDR, PHP, VND, THB, INR, MXN, BRL, ARS, NGN, COP.

---

## 5. Empat aplikasi (satu untuk tiap peran)

- **Sender (HP, consumer):** deposit USDC, bikin compliance proof di HP, keluar **claim note**
  (string/QR) buat dikasih ke penerima.
- **Receiver (HP, consumer):** paste claim note, lihat nilai lokal (kurs oracle on-chain),
  withdraw + cash out ke fiat. Note itu **uangnya** (bearer), gak perlu buka akun.
- **Regulator (dashboard):** verifikasi receipt disclosure (di browser + on-chain), terbitkan
  audit request, lihat jejak audit. Di sini momen **tamper ditolak** ditunjukin.
- **Operator (dashboard):** kesehatan pool (Merkle root/depth), kebijakan ASP (allow/deny),
  kesegaran oracle, konfigurasi koridor. **Monitoring read-only; admin write ditandatangani
  offline** (admin key gak pernah di browser).

---

## 6. Stack teknis (yang bikin ini nyata)

- **ZK:** Circom 2, Groth16 over BN254, snarkjs, Poseidon (circomlibjs). **8 circuit.**
- **Kontrak:** Rust di Soroban (Stellar), **15 kontrak** (inti: pool + 7 verifier; tambahan:
  verifier reserves, policy-registry, reserves, reserves-aggregate, plus pool-enforced,
  pool-accumulator, dan pool-timelock di jalur preview), host function Protocol 25/26.
  **314 test Cargo lolos** (52 di pool yang live) dan **230 test webapp lolos.**
- **Standar Stellar:** SEP-1 (stellar.toml), SEP-10, SEP-12 (status KYC), SEP-24
  (deposit/withdraw interaktif), SEP-38 (firm quote), SEP-41/SAC (USDC), SEP-7 (URI
  pembayaran), Reflector SEP-40 (oracle), fee-bump CAP-15.
- **Lapisan compliance yang sudah jalan:** pertukaran Travel Rule OpenVASP TRP 3.2.1 dengan
  verifikasi tanda tangan Ed25519 (plus TRISA companion node yang menunggu pendaftaran VASP),
  Circle CCTP V2 dua arah, proof-of-reserves kriptografis yang eksak, dan Reclaim
  proof-of-personhood yang mengisi ASP allow-list.
- **Frontend:** Next.js + React + TypeScript + Tailwind, static export di Vercel, PWA
  (bisa di-install). Live: https://tukar-six.vercel.app

---

## 7. Angka penting (hafal ini)
**8 circuit · 15 kontrak on-chain · 314 test Cargo + 230 test webapp lolos.** USDC testnet
asli. Fiat edges memakai panggilan SEP asli ke reference anchor testnet milik SDF, jadi anchor
berlisensi masih langkah production. Belum diaudit profesional. Semua yang di tengah (proof,
deposit, verifikasi, Travel Rule, CCTP, reserves) nyata dan bisa dicek on-chain sekarang.

## 8. Satu kalimat kalau ditanya "ini apa"
"Tukar itu koridor kirim uang lintas negara di Stellar yang **privat buat pengguna tapi bisa
dibuktikan ke regulator**, jadi anchor berlisensi beneran bisa jalanin. Private in the middle,
accountable at the edges."

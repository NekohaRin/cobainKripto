# Classified E-Voting & Campaign Command System

Sistem e-voting satu halaman (SPA) dengan dua peran: **Pemilih** dan **Panitia**. Dibangun dengan Node.js, Express, MySQL, dan Vanilla JS tanpa build step.

## Struktur Folder

```
e-voting-v2/
├── database/schema.sql        # tabel, trigger has_voted, tabel campaign_docs
├── server/
│   ├── server.js              # API, sesi, validasi, menyajikan public/ dan shared/
│   ├── ledger.js              # hash chaining, Merkle tree, tally
│   ├── package.json
│   └── .env.example
├── shared/layers.js           # Caesar -> Rail Fence -> AES-256-GCM (browser dan server)
└── public/
    ├── index.html             # sidebar berbasis peran
    ├── css/app.css
    ├── css/app-additions.css  # toast, topbar, kotak penjelasan
    └── js/
        ├── app.js             # orkestrator UI
        ├── dongle.js          # dongle .key (unduh otomatis)
        ├── face.js            # face-api.js, descriptor 128-d
        ├── file-crypto.js     # .secure = RC4 + HMAC-SHA256
        └── dct-stego.js       # steganografi DCT 8x8
```

## Persyaratan

- Node.js 20 atau lebih baru
- MySQL (XAMPP atau instalasi lain)
- Browser Chrome atau Edge desktop (wajib: dongle memakai File System Access API, hanya jalan di HTTPS atau `localhost`)
- Koneksi internet untuk memuat Chart.js dan model face-api dari CDN

## Instalasi

1. Nyalakan Apache dan MySQL di XAMPP, lalu impor `database/schema.sql` lewat phpMyAdmin.
2. Pastikan tabel `campaign_docs` ada (kolom: `id`, `name`, `size`, `data LONGBLOB`, `created_at`). Tabel ini tidak ada di skema lama.
3. Masuk ke folder server:
   ```powershell
   cd server
   ```
   File `server/.env` sudah disertakan. Periksa `DB_HOST`, `DB_USER`, `DB_PASS`, dan `DB_NAME`; ganti juga nilai rahasia `ADMIN_KEY`, `ELECTION_SECRET`, `NIK_SALT`, dan `FACE_KEY` sebelum penggunaan selain demonstrasi lokal. Jangan membuat file `.env.example` baru atau menyalin placeholder rahasia apa adanya.
4. Buat dongle panitia (sekali saja). Colok flashdisk, lalu jalankan (ganti `E:` dengan drive flashdisk):
   ```powershell
   cd server
   node make-admin-dongle.js E:\admin-dongle.key
   ```
   Salin baris `ADMIN_DONGLE_HASH=...` yang muncul ke `server/.env`. Dongle pemilih dibuat otomatis saat registrasi.
5. Jalankan:
   ```bash
   npm install
   npm start
   ```
6. Buka `http://localhost:3000` di Chrome atau Edge.

Server menolak berjalan dengan `NODE_ENV=production` jika empat rahasia di atas belum diisi.

## Peran dan Menu

### Pemilih

Pemilih hanya melihat dua menu setelah login: **Surat Suara** dan **Status Pemilih**.

- **Gatekeeper**: daftar akun (NIK, PIN, rekam wajah). Pemilih memilih lokasi flashdisk, lalu dongle `.key` ditulis ke sana.
- **Login 3 faktor**: dongle `.key`, PIN, dan pemindaian wajah.
- **Surat Suara**: memilih satu kandidat. Suara dienkripsi tiga lapis di browser, lalu dikirim. Pemilih hanya bisa memilih sekali.
- **Status Pemilih**: menampilkan NIK tersamar, kode pemilih, status memilih, waktu pencatatan, dan nomor blok ledger. Pilihan tidak ditampilkan karena ledger tidak menyimpan identitas.

### Panitia (Admin)

Panitia masuk lewat kartu **Akses Panitia** di Gatekeeper dengan Kunci Panitia. Sesi panitia berlaku 30 menit. Panitia tidak bisa memilih.

- **Tactical Command Messaging**: kanal pesan perintah terenkripsi 3 lapis antar koordinator kampanye.
- **Campaign Logistical Vault**: brankas dokumen logistik. Berkas dienkripsi di browser (`.secure`), lalu disimpan ke server atau diunduh.
- **Anti-Counterfeit Credential**: menanam watermark DCT ke poster resmi, lalu memeriksa materi yang beredar. Hasilnya ASLI, MENCURIGAKAN (kode berbeda), atau TIRUAN (watermark tidak ditemukan).
- **Command Dashboard**: grafik suara tersegel, status rantai ledger, daftar blok, tombol segel, dan demo tamper.

## Alur Sistem

### Registrasi

1. Pemilih mengisi NIK 16 digit dan PIN 4 digit, lalu merekam wajah (5 sampel dirata-rata).
2. Server memeriksa apakah wajah sudah ada di database dengan jarak Euclidean ≤ 0.50. Jika cocok, registrasi ditolak dengan 400 (satu wajah tidak boleh dipakai untuk banyak NIK).
3. Server menyimpan hash NIK (SHA-256 dengan salt), hash PIN (PBKDF2), hash token dongle, dan descriptor wajah terenkripsi AES-256-GCM.
4. Dongle `.key` berisi kode pemilih, token, dan NIK tersamar, lalu ditulis ke flashdisk yang dipilih pemilih.

### Login

Server memeriksa ketiga faktor: token dongle, PIN (PBKDF2, dibandingkan dengan `timingSafeEqual`), dan wajah. Lima kali gagal mengunci akun. Sesi pemilih berlaku 15 menit dan dihapus setelah vote.

### Voting

1. Browser membuat paket Caesar → Rail Fence → AES-256-GCM. Kunci AES diambil dari token sesi.
2. Server membuka paket, lalu mencatat hash HMAC pilihan ke antrean.
3. `has_voted` dikunci dalam transaksi dan oleh trigger database.
4. Antrean disegel menjadi blok (`BLOCK_SIZE` suara per blok) dengan urutan diacak, Merkle root, dan hash chaining.

## Penjelasan Algoritma

**Super-enkripsi 3 lapis (teks dan suara):**

- **Caesar**: setiap huruf digeser k posisi, C = (P + k) mod 26. Dekripsi menggeser balik.
- **Rail Fence**: huruf ditulis zig-zag pada N rel, lalu dibaca baris demi baris. Dekripsi membentuk ulang pola zig-zag.
- **AES-256-GCM**: kunci dari PBKDF2-SHA256 (100.000 iterasi, salt 16 B), IV 12 B, dan tag autentikasi 16 B. Paket Base64 berisi salt, IV, dan ciphertext+tag. Dekripsi memeriksa tag dulu.

Dekripsi membalik urutan: AES → Rail Fence → Caesar. Setiap tahap ditampilkan dalam tabel bertahap di halaman.

**File `.secure`:** PBKDF2 menghasilkan kunci RC4 (16 B) dan kunci HMAC (32 B). RC4 membuang 768 byte keystream pertama, lalu di-XOR dengan data. HMAC-SHA256 dihitung atas seluruh berkas (encrypt-then-MAC). Jika HMAC tidak cocok, dekripsi ditolak.

**Steganografi DCT:** luminans dibagi blok 8x8, lalu DCT. Satu bit disandikan lewat selisih C[3][4] dan C[4][3] (minimal 25), diulang 3 blok, dan dibaca dengan suara mayoritas. Header 16 bit menyimpan panjang pesan.

**Ledger:** hash pilihan memakai HMAC dengan `ELECTION_SECRET`. Blok memuat Merkle root dan hash blok sebelumnya (SHA-256). Mengubah satu blok membuat rantai berstatus TAMPERED.

## Variabel Lingkungan (.env)

| Variabel                                   | Fungsi                                                          |
| ------------------------------------------ | --------------------------------------------------------------- |
| `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` | koneksi MySQL                                                   |
| `PORT`                                     | port server (default 3000)                                      |
| `ADMIN_KEY`                                | kunci panitia (wajib diganti)                                   |
| `ELECTION_SECRET`                          | kunci HMAC hash pilihan (wajib diganti)                         |
| `NIK_SALT`                                 | salt hash NIK (wajib diganti)                                   |
| `FACE_KEY`                                 | kunci enkripsi descriptor wajah (wajib diganti)                 |
| `ELECTION_SHIFT`, `ELECTION_RAILS`         | parameter Caesar dan Rail Fence                                 |
| `BLOCK_SIZE`                               | jumlah suara per blok (default 3)                               |
| `FACE_THRESHOLD`                           | ambang batas jarak Euclidean pencocokan wajah (default `0.30`)  |
| `ALLOW_TAMPER_DEMO`                        | `false` mematikan tombol tamper demo                            |
| `NODE_ENV`                                 | `production` mengaktifkan pemeriksaan rahasia wajib             |

## Pengujian yang Disarankan

1. Daftar NIK pertama dengan wajah Anda, lalu unduh dongle.
2. Coba daftar NIK kedua dengan wajah yang sama. Server harus menolak dengan pesan wajah sudah terdaftar.
3. Login pemilih, pilih kandidat, lalu cek halaman Status.
4. Logout, lalu pilih kembali file `.key` dan pastikan login tetap berjalan.
5. Login panitia dan cek setiap menu, termasuk watermark DCT (tanam, lalu periksa dengan dan tanpa kode yang sama).
6. Tekan "Tamper blok 1" dan pastikan status rantai menjadi TAMPERED.

## Keterbatasan

- Kunci panitia dan token dikirim lewat HTTP. Gunakan HTTPS saat dipakai di luar lokal.
- Tidak ada deteksi liveness pada wajah, sehingga foto atau layar masih bisa dipakai. Cek Sybil hanya mitigasi.
- Dengan jumlah pemilih kecil, blok kecil dapat membuka pilihan lewat korelasi dengan data lain. Naikkan `BLOCK_SIZE`.
- Caesar dan Rail Fence adalah sandi klasik dan mudah dipecahkan. Keamanan utama ada pada AES-256-GCM.
- Dongle adalah berkas biasa di flashdisk. Berkasnya bisa disalin, dan server tidak bisa memastikan lokasinya benar-benar USB. Simpan hanya di flashdisk dan hapus salinan lain.

## Dongle Flashdisk (login wajib dongle)

Dongle dicek di browser pengguna, jadi aplikasi bisa di-host. Tanpa dongle, tidak ada yang bisa login.

**Pemilih:** saat registrasi, pilih lokasi flashdisk lalu `.key` ditulis di sana. Saat login, pilih `.key` dari flashdisk, isi PIN, lalu pindai wajah.

**Panitia:** jalankan `node make-admin-dongle.js E:\admin-dongle.key` sekali, isi `ADMIN_DONGLE_HASH` di `.env`. Login panitia butuh dongle itu dan Kunci Panitia.

**Selama sesi:**

1. Server mengirim `nonce` acak. Browser membaca ulang berkas `.key` dari flashdisk tiap 2 detik.
2. Browser mengirim `HMAC-SHA256(token, nonce)` ke `/api/beat`, dan server membalas dengan nonce baru (anti replay).
3. Flashdisk dicabut: pembacaan berkas gagal, browser langsung logout. Jika browser tertutup atau bukti berhenti lebih dari `DONGLE_TIMEOUT_MS` (default 8 dtk), server mencabut sesi itu.
4. Sesi hanya dicabut untuk pengguna yang bersangkutan, tidak mengunci pengguna lain.

Catatan: tab yang tersembunyi lebih dari 5 menit bisa kehilangan timer dan sesinya dicabut, selaras dengan kunci otomatis 5 menit tanpa aktivitas.

Set `DONGLE_REQUIRED=false` hanya untuk pengembangan lokal.

**Batasan keamanan:** ini bukti kehadiran berbasis berkas untuk proyek akademik. Berkas `.key` bisa disalin, dan server tidak bisa memastikan berkas itu berada di USB. Perangkat keras dengan kunci privat yang tidak bisa diekspor (FIDO2/WebAuthn) lebih kuat.


HOST:

gateway01.ap-northeast-1.prod.aws.tidbcloud.com

PORT:

4000

USERNAME:

2LyNeGeraNDuZqg.root

PASSWORD:

<PASSWORD>

DATABASE:

sys

mysql --comments -u '2LyNeGeraNDuZqg.root' -h gateway01.ap-northeast-1.prod.aws.tidbcloud.com -P 4000 -D 'sys' --ssl-mode=VERIFY_IDENTITY --ssl-ca=<CA_PATH> -p'<PASSWORD>'
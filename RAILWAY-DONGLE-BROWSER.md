# Railway + TiDB Cloud + Browser USB Dongle

## Mode dongle cloud
Set Railway Variables:
- `NODE_ENV=production`
- `DONGLE_MODE=browser`
- `DONGLE_REQUIRED=true`
- `DB_HOST` = TiDB host
- `DB_PORT=4000` (ikuti port yang diberikan TiDB)
- `DB_USER` = TiDB username
- `DB_PASS` = TiDB password
- `DB_NAME=evoting`
- `DB_SSL=true`
- `ADMIN_KEY` = secret admin yang kuat
- `ADMIN_TOKEN_HASH` = SHA-256 token dari file `dongle-ADMIN.key`
- `ELECTION_SECRET`, `NIK_SALT`, `FACE_KEY` = secret kuat dan stabil
- `ELECTION_SHIFT=7`
- `ELECTION_RAILS=4`
- `BLOCK_SIZE=3`
- `FACE_THRESHOLD=0.4`
- `FACE_REGISTER_THRESHOLD=0.35`
- `ALLOW_TAMPER_DEMO=false`

`ADMIN_USB_SERIAL` tidak diperlukan pada `DONGLE_MODE=browser`.
Jangan set `DONGLE_REQUIRED=false` untuk deployment produksi.

## Cara menggunakan dongle
1. Buka aplikasi melalui HTTPS Railway dengan Chrome atau Edge.
2. Klik **Hubungkan Dongle**.
3. Pilih file `dongle-Vxxxxxx.key` di flashdisk.
4. Masukkan PIN dan lakukan pemindaian wajah.
5. File handle disimpan di IndexedDB. Browser akan mencoba memulihkannya saat halaman dibuka lagi jika izin masih berlaku.
6. Untuk panitia, klik **Hubungkan Dongle Admin** dan pilih `dongle-ADMIN.key`.

Browser mungkin meminta pengguna memilih ulang file atau memberi izin lagi setelah restart browser, izin dicabut, atau perangkat/file tidak tersedia. Browser tidak dapat mendeteksi flashdisk mass-storage baru dicolok secara diam-diam.

## Validasi sesi
Pada mode browser, browser membaca ulang file `.key` sebelum setiap request terautentikasi dan mengirim token melalui header. Backend membandingkan hash token dengan hash yang tersimpan pada sesi. Jika file tidak dapat dibaca, browser mengirim logout dan mengunci tampilan.
Ini mempertahankan pemeriksaan aplikasi, tetapi file `.key` biasa tetap dapat disalin; ini bukan perangkat kriptografi anti-kloning.

## Database
Impor `database/schema.sql` ke database `evoting` terlebih dahulu. Pastikan tabel `pending_votes` dan `ledger_blocks` juga tersedia sesuai skema project.

## Railway
Railway menggunakan `Dockerfile` di root. Atur Healthcheck Path ke `/health`, lalu Generate Domain. Jalankan satu replica karena sesi aplikasi disimpan di memori.

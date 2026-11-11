// Membuat dongle panitia. Pemakaian:  node make-admin-dongle.js E:\admin-dongle.key
// Berkas .key ditulis ke flashdisk, lalu salin baris ADMIN_DONGLE_HASH ke .env (atau environment hosting).
const crypto = require("crypto"), fs = require("fs");
const out = process.argv[2];
if (!out) { console.error("Pemakaian: node make-admin-dongle.js <lokasi-berkas.key>"); process.exit(1); }
if (fs.existsSync(out)) { console.error("Berkas sudah ada, tidak ditimpa: " + out); process.exit(1); }
const token = crypto.randomBytes(32).toString("hex");
fs.writeFileSync(out, JSON.stringify({ role: "admin", token }), { flag: "wx" });
console.log("Dongle panitia ditulis ke " + out + "\nTambahkan ke .env / environment hosting:\nADMIN_DONGLE_HASH=" + crypto.createHash("sha256").update(token).digest("hex"));

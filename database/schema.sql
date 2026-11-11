CREATE DATABASE IF NOT EXISTS evoting CHARACTER SET utf8mb4;
USE evoting;

CREATE TABLE voters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  voter_code VARCHAR(12) NOT NULL UNIQUE,
  nik_hash CHAR(64) NOT NULL UNIQUE,        -- SHA-256(salt + NIK)
  pin_salt CHAR(32) NOT NULL,
  pin_hash CHAR(64) NOT NULL,               -- PBKDF2-HMAC-SHA256
  token_hash CHAR(64) NOT NULL,             -- SHA-256 token kartu pemilih
  face_enc TEXT NOT NULL,                   -- descriptor wajah, AES-256-GCM
  failed_attempts TINYINT NOT NULL DEFAULT 0,
  locked_until_ms BIGINT NULL DEFAULT NULL,    -- epoch ms UTC, dikunci sementara setelah 5x gagal
  has_voted TINYINT(1) NOT NULL DEFAULT 0
);
CREATE TABLE candidates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  vision TEXT
);
CREATE TABLE pending_votes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  choice_hash CHAR(64) NOT NULL             -- tanpa kolom pemilih
);
CREATE TABLE ledger_blocks (
  idx INT PRIMARY KEY,
  ts DATETIME NOT NULL,
  merkle_root CHAR(64) NOT NULL,
  prev_hash CHAR(64) NOT NULL,
  hash CHAR(64) NOT NULL,
  tx_json JSON NOT NULL                     -- daftar hash pilihan (acak urutan)
);

CREATE TABLE IF NOT EXISTS campaign_docs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    size INT NOT NULL,
    data LONGBLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- has_voted terkunci permanen: tidak boleh kembali ke 0
DELIMITER $$
CREATE TRIGGER trg_lock_has_voted BEFORE UPDATE ON voters
FOR EACH ROW BEGIN
  IF OLD.has_voted = 1 AND NEW.has_voted = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'has_voted terkunci permanen';
  END IF;
END$$
DELIMITER ;

INSERT INTO candidates (name, vision) VALUES
 ('Andi Pratama', 'Transparansi anggaran organisasi.'),
 ('Budi Santoso', 'Digitalisasi layanan anggota.'),
 ('Citra Lestari', 'Penguatan tata kelola dan audit.');

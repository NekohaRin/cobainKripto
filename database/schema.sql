CREATE DATABASE IF NOT EXISTS evoting CHARACTER SET utf8mb4;
USE evoting;
CREATE TABLE voters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  voter_code VARCHAR(12) NOT NULL UNIQUE,
  nik_hash CHAR(64) NOT NULL UNIQUE,
  pin_salt CHAR(32) NOT NULL,
  pin_hash CHAR(64) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  face_enc TEXT NOT NULL,
  failed_attempts TINYINT NOT NULL DEFAULT 0,
  has_voted TINYINT(1) NOT NULL DEFAULT 0
);
CREATE TABLE candidates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  vision TEXT
);
CREATE TABLE pending_votes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  choice_hash CHAR(64) NOT NULL
);
CREATE TABLE ledger_blocks (
  idx INT PRIMARY KEY,
  ts DATETIME NOT NULL,
  merkle_root CHAR(64) NOT NULL,
  prev_hash CHAR(64) NOT NULL,
  hash CHAR(64) NOT NULL,
  tx_json JSON NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_docs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  size INT NOT NULL,
  data LONGBLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO candidates (name, vision)
VALUES (
    'Andi Pratama',
    'Transparansi anggaran organisasi.'
  ),
  ('Budi Santoso', 'Digitalisasi layanan anggota.'),
  (
    'Citra Lestari',
    'Penguatan tata kelola dan audit.'
  );
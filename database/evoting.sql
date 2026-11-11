-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 10, 2026 at 06:30 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `evoting`
--

-- --------------------------------------------------------

--
-- Table structure for table `campaign_docs`
--

CREATE TABLE `campaign_docs` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `size` int(11) NOT NULL,
  `data` longblob NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `candidates`
--

CREATE TABLE `candidates` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `vision` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `candidates`
--

INSERT INTO `candidates` (`id`, `name`, `vision`) VALUES
(1, 'Prabski', 'Makan Besar Gratis'),
(2, 'Rusdi', 'tidur'),
(3, 'Zidan', 'o');

-- --------------------------------------------------------

--
-- Table structure for table `ledger_blocks`
--

CREATE TABLE `ledger_blocks` (
  `idx` int(11) NOT NULL,
  `ts` datetime NOT NULL,
  `merkle_root` char(64) NOT NULL,
  `prev_hash` char(64) NOT NULL,
  `hash` char(64) NOT NULL,
  `tx_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`tx_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `ledger_blocks`
--

INSERT INTO `ledger_blocks` (`idx`, `ts`, `merkle_root`, `prev_hash`, `hash`, `tx_json`) VALUES
(0, '2026-11-10 05:13:58', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '0', '7a63cda28b3ef04691b208bdbc356f4a64db44d69ea9585d82465ce9f21e7c5d', '[]');

-- --------------------------------------------------------

--
-- Table structure for table `pending_votes`
--

CREATE TABLE `pending_votes` (
  `id` int(11) NOT NULL,
  `choice_hash` char(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `pending_votes`
--

INSERT INTO `pending_votes` (`id`, `choice_hash`) VALUES
(6, '30a498be5c90019e5ca875b2b1fd1c2dcdd97959e3c857a89a4b0b335b230f83');

-- --------------------------------------------------------

--
-- Table structure for table `voters`
--

CREATE TABLE `voters` (
  `id` int(11) NOT NULL,
  `voter_code` varchar(12) NOT NULL,
  `nik_hash` char(64) NOT NULL,
  `pin_salt` char(32) NOT NULL,
  `pin_hash` char(64) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `face_enc` text NOT NULL,
  `failed_attempts` tinyint(4) NOT NULL DEFAULT 0,
  `has_voted` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `voters`
--

INSERT INTO `voters` (`id`, `voter_code`, `nik_hash`, `pin_salt`, `pin_hash`, `token_hash`, `face_enc`, `failed_attempts`, `has_voted`) VALUES
(17, 'V206000', '7a5feb30c20a8db1db749732a652bdca75954ae85545e9a813ca8e62ea322c55', 'd7d14cc76d628e8f9f8dc5829f8ceecf', '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', 0, 1);

--
-- Triggers `voters`
--
DELIMITER $$
CREATE TRIGGER `trg_lock_has_voted` BEFORE UPDATE ON `voters` FOR EACH ROW BEGIN
  IF OLD.has_voted = 1 AND NEW.has_voted = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'has_voted terkunci permanen';
  END IF;
END
$$
DELIMITER ;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `campaign_docs`
--
ALTER TABLE `campaign_docs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `candidates`
--
ALTER TABLE `candidates`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `ledger_blocks`
--
ALTER TABLE `ledger_blocks`
  ADD PRIMARY KEY (`idx`);

--
-- Indexes for table `pending_votes`
--
ALTER TABLE `pending_votes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `voters`
--
ALTER TABLE `voters`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `voter_code` (`voter_code`),
  ADD UNIQUE KEY `nik_hash` (`nik_hash`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `campaign_docs`
--
ALTER TABLE `campaign_docs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `candidates`
--
ALTER TABLE `candidates`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `pending_votes`
--
ALTER TABLE `pending_votes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `voters`
--
ALTER TABLE `voters`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

-- phpMyAdmin SQL Dump
-- version 5.0.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Jan 12, 2020 at 09:06 PM
-- Server version: 10.3.18-MariaDB-0+deb10u1
-- PHP Version: 7.3.13-1+0~20191218.50+debian10~1.gbp23c2da

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `wastecalendar`
--

-- --------------------------------------------------------

--
-- Table structure for table `amz_endpoint`
--

CREATE TABLE `amz_endpoint` (
  `amzep_id` bigint(20) UNSIGNED NOT NULL,
  `amzep_skillid` varchar(512) NOT NULL,
  `amzep_accesstoken` varchar(1024) NOT NULL,
  `amzep_expires` datetime NOT NULL,
  `amzep_lastchanged` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `amz_endpoint`
--

-- --------------------------------------------------------

--
-- Table structure for table `amz_user`
--

CREATE TABLE `amz_user` (
  `amz_id` bigint(20) UNSIGNED NOT NULL,
  `amz_skillid` varchar(256) NOT NULL,
  `amz_userid` varchar(512) NOT NULL,
  `amz_accountlinked` tinyint(1) NOT NULL DEFAULT 0,
  `amz_permissions` tinyint(1) NOT NULL DEFAULT 0,
  `amz_apiendpoint` varchar(1024) DEFAULT NULL,
  `amz_apiaccesstoken` varchar(1024) NOT NULL,
  `amz_lastchanged` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `oc_userid` varchar(64) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `amz_user`
--

-- --------------------------------------------------------

--
-- Table structure for table `oc_user`
--

CREATE TABLE `oc_user` (
  `oc_id` bigint(20) UNSIGNED NOT NULL,
  `oc_userid` varchar(64) NOT NULL,
  `oc_accesstoken` varchar(1024) NOT NULL,
  `oc_refreshtoken` varchar(1024) NOT NULL,
  `oc_expires` datetime NOT NULL DEFAULT current_timestamp(),
  `oc_lastchanged` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Dumping data for table `oc_user`
--

--
-- Indexes for dumped tables
--

--
-- Indexes for table `amz_endpoint`
--
ALTER TABLE `amz_endpoint`
  ADD PRIMARY KEY (`amzep_id`),
  ADD UNIQUE KEY `amzep_skillid` (`amzep_skillid`);

--
-- Indexes for table `amz_user`
--
ALTER TABLE `amz_user`
  ADD PRIMARY KEY (`amz_id`),
  ADD UNIQUE KEY `amz_unique` (`amz_skillid`,`amz_userid`) USING BTREE,
  ADD KEY `oc_id` (`oc_userid`);

--
-- Indexes for table `oc_user`
--
ALTER TABLE `oc_user`
  ADD PRIMARY KEY (`oc_id`),
  ADD UNIQUE KEY `oc_userid` (`oc_userid`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `amz_endpoint`
--
ALTER TABLE `amz_endpoint`
  MODIFY `amzep_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `amz_user`
--
ALTER TABLE `amz_user`
  MODIFY `amz_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `oc_user`
--
ALTER TABLE `oc_user`
  MODIFY `oc_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

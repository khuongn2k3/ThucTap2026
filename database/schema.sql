-- =========================================
-- Hunyuan3D Database Schema
-- =========================================

USE hunyuan3d_db;

-- Disable foreign key checks
SET FOREIGN_KEY_CHECKS = 0;

-- Drop existing tables
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS model_jobs;
DROP TABLE IF EXISTS users;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- =========================================
-- TABLE 1: users
-- =========================================
CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NULL COMMENT 'NULL for Google OAuth users',
    role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    google_id VARCHAR(255) NULL UNIQUE,
    avatar_url VARCHAR(500) NULL,
    tokens INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Token balance for 3D conversions',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_google_id (google_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =========================================
-- TABLE 2: payments
-- =========================================
CREATE TABLE payments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    package_id VARCHAR(50) NOT NULL COMMENT 'basic, pro, premium',
    amount_vnd FLOAT NOT NULL COMMENT 'Payment amount in VND',
    tokens INT UNSIGNED NOT NULL COMMENT 'Tokens to be credited',
    hex_id VARCHAR(20) NULL UNIQUE COMMENT 'XOR encrypted payment ID',
    status ENUM('pending', 'completed', 'failed', 'expired') NOT NULL DEFAULT 'pending',
    sepay_transaction_id VARCHAR(100) NULL COMMENT 'SePay transaction reference',
    paid_at DATETIME NULL COMMENT 'Payment completion time',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL COMMENT 'Payment expiry (60 minutes)',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_hex_id (hex_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =========================================
-- TABLE 3: model_jobs
-- =========================================
CREATE TABLE model_jobs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    job_id VARCHAR(100) NOT NULL UNIQUE,
    status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    input_image_url VARCHAR(500) NOT NULL,
    output_model_url VARCHAR(500) NULL,
    tokens_used INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Tokens consumed for this job',
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_job_id (job_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Schema created successfully!' AS status;
SELECT 'Tables: users, payments, model_jobs' AS info;
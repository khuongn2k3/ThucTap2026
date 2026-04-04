-- =========================================
-- Hunyuan3D Database Schema
-- =========================================

USE hunyuan3d_db;

-- Disable foreign key checks
SET FOREIGN_KEY_CHECKS = 0;

-- Drop existing tables
DROP TABLE IF EXISTS submission_categories;
DROP TABLE IF EXISTS gallery_likes;
DROP TABLE IF EXISTS gallery_collections;
DROP TABLE IF EXISTS gallery_submissions;
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
    model_name VARCHAR(255) NULL COMMENT 'Model name from upload filename',
    submission_id INT UNSIGNED NULL COMMENT 'Link to gallery_submissions after publishing',
    faces INT UNSIGNED NULL COMMENT 'Number of faces in generated mesh',
    vertices INT UNSIGNED NULL COMMENT 'Number of vertices in generated mesh',
    has_texture BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether model has PBR texture',
    has_skeleton BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether model has skeleton/rig',
    tokens_used INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Tokens consumed for this job',
    error_message TEXT NULL,
    metrics JSON NULL COMMENT 'VRAM, RAM, duration stats per stage',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_job_id (job_id),
    INDEX idx_status (status),
    INDEX idx_submission_id (submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =========================================
-- TABLE 4: gallery_submissions
-- =========================================
CREATE TABLE gallery_submissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL DEFAULT (UUID()) COMMENT 'Public share UUID',
    user_id INT UNSIGNED NOT NULL,
    model_name VARCHAR(255) NOT NULL COMMENT 'User-provided model name',
    tags VARCHAR(500) NULL COMMENT 'Comma-separated tags, e.g. character,fantasy,dragon',
    image_url VARCHAR(500) NULL COMMENT 'Ảnh user upload (input reference)',
    thumbnail_url VARCHAR(500) NULL COMMENT 'Ảnh render tự động từ 3D model (gallery card)',
    model_url VARCHAR(500) NOT NULL COMMENT '3D model file URL (GLB/OBJ/STL)',
    faces INT UNSIGNED NULL COMMENT 'Number of faces in generated mesh',
    vertices INT UNSIGNED NULL COMMENT 'Number of vertices in generated mesh',
    source VARCHAR(50) NULL DEFAULT 'manual' COMMENT 'Nguồn tạo submission: manual, convert3d',
    is_public BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Admin sets true to show on Gallery',
    likes_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Denormalized like count',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_uuid (uuid),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_is_public (is_public)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =========================================
-- TABLE 5: submission_categories
-- =========================================
CREATE TABLE submission_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    submission_id INT UNSIGNED NOT NULL,
    category VARCHAR(50) NOT NULL COMMENT 'e.g. Character, Vehicle, Animal...',

    FOREIGN KEY (submission_id) REFERENCES gallery_submissions(id) ON DELETE CASCADE,
    INDEX idx_submission_id (submission_id),
    INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =========================================
-- TABLE 6: gallery_likes
-- =========================================
CREATE TABLE gallery_likes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    submission_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_user_submission_like (user_id, submission_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES gallery_submissions(id) ON DELETE CASCADE,
    INDEX idx_submission_likes (submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =========================================
-- TABLE 7: gallery_collections
-- =========================================
CREATE TABLE gallery_collections (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    submission_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_user_submission_collect (user_id, submission_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES gallery_submissions(id) ON DELETE CASCADE,
    INDEX idx_submission_collections (submission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Add FK from model_jobs -> gallery_submissions (must be after both tables exist)
ALTER TABLE model_jobs
    ADD CONSTRAINT fk_model_jobs_submission
    FOREIGN KEY (submission_id) REFERENCES gallery_submissions(id) ON DELETE SET NULL;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Schema created successfully!' AS status;
SELECT 'Tables: users, payments, model_jobs, gallery_submissions, submission_categories, gallery_likes, gallery_collections' AS info;

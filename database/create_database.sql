-- =========================================
-- Create Database & User
-- =========================================
-- ⚠️ CHỈ CHẠY FILE NÀY KHI:
-- 1. Lần đầu setup trên máy mới
-- 2. Database chưa tồn tại
-- 3. User MySQL chưa được tạo
-- =========================================

-- Tạo database
CREATE DATABASE IF NOT EXISTS hunyuan3d_db 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- Tạo MySQL user
CREATE USER IF NOT EXISTS 'khuongn2k3'@'localhost' IDENTIFIED BY '123123';

-- Cấp quyền
GRANT ALL PRIVILEGES ON hunyuan3d_db.* TO 'khuongn2k3'@'localhost';

FLUSH PRIVILEGES;

-- Hiển thị kết quả
SELECT 'Database và user đã được tạo thành công!' AS status;
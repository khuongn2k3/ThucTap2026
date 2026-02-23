-- =========================================
-- Hunyuan3D Database Initialization
-- =========================================

USE hunyuan3d_db;

-- =========================================
-- Admin User (ROLE: admin)
-- Email: nguyenphuckhuongceo@gmail.com
-- Password: 123456
-- =========================================
INSERT INTO users (name, email, password, role, tokens) VALUES
('Nguyen Phuc Khuong', 'nguyenphuckhuongceo@gmail.com', '$2b$12$f.NAhnqpa07.Ao/jDZOo9eUkfwu7eC2xvFGDuwnJzcO6ltBqi41W.', 'admin', 1000)
ON DUPLICATE KEY UPDATE 
    name = VALUES(name),
    role = VALUES(role),
    tokens = VALUES(tokens),
    password = VALUES(password);

-- =========================================
-- Test User (ROLE: user)
-- Email: user@test.com
-- Password: 123456
-- =========================================
INSERT INTO users (name, email, password, role, tokens) VALUES
('Test User', 'user@test.com', '$2b$12$f.NAhnqpa07.Ao/jDZOo9eUkfwu7eC2xvFGDuwnJzcO6ltBqi41W.', 'user', 100)
ON DUPLICATE KEY UPDATE 
    name = VALUES(name),
    role = VALUES(role),
    tokens = VALUES(tokens),
    password = VALUES(password);

-- =========================================
-- Verify Data
-- =========================================
SELECT 'Initial data inserted successfully!' AS status;
SELECT id, name, email, role, tokens, created_at FROM users;
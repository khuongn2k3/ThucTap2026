@echo off
REM =========================================
REM Hunyuan3D Database Setup (XAMPP)
REM =========================================

echo ================================================
echo Database Setup for Hunyuan3D
echo ================================================

REM MySQL Path - CHANGE THIS TO YOUR XAMPP PATH
set MYSQL_PATH=E:\xampp\mysql\bin
set PATH=%MYSQL_PATH%;%PATH%

REM Check MySQL
echo.
echo [1/4] Checking MySQL...
"%MYSQL_PATH%\mysql.exe" --version
if errorlevel 1 (
    echo [ERROR] MySQL not found at %MYSQL_PATH%
    echo Please update MYSQL_PATH in setup.bat
    pause
    exit /b 1
)
echo [OK] MySQL found
echo.

REM Config
set DB_HOST=localhost
set DB_PORT=3306
set DB_NAME=hunyuan3d_db
set DB_USER=khuongn2k3
set DB_PASS=123123

echo Database Configuration:
echo    Host: %DB_HOST%:%DB_PORT%
echo    Database: %DB_NAME%
echo    MySQL User: %DB_USER%
echo    Password: %DB_PASS%
echo.

REM =========================================
REM STEP 1: Verify Database Exists
REM =========================================
echo ================================================
echo [2/4] Verifying database exists...
echo ================================================

"%MYSQL_PATH%\mysql.exe" -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% -e "USE %DB_NAME%; SELECT 'Database exists' AS status;"

if errorlevel 1 (
    echo [ERROR] Database %DB_NAME% does not exist or user has no access
    echo.
    echo Please run manually:
    echo   mysql -u root
    echo   CREATE DATABASE hunyuan3d_db;
    echo   CREATE USER 'khuongn2k3'@'localhost' IDENTIFIED BY '123123';
    echo   GRANT ALL ON hunyuan3d_db.* TO 'khuongn2k3'@'localhost';
    pause
    exit /b 1
)

echo [OK] Database verified
echo.

REM =========================================
REM STEP 2: Create Tables
REM =========================================
echo ================================================
echo [3/4] Creating/Recreating tables...
echo ================================================

"%MYSQL_PATH%\mysql.exe" -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% %DB_NAME% < schema.sql

if errorlevel 1 (
    echo [ERROR] Failed to create tables
    pause
    exit /b 1
)

echo [OK] Tables created
echo.

REM =========================================
REM STEP 3: Insert Initial Data
REM =========================================
echo ================================================
echo [4/4] Inserting initial data...
echo ================================================

"%MYSQL_PATH%\mysql.exe" -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% %DB_NAME% < init.sql

if errorlevel 1 (
    echo [ERROR] Failed to insert data
    pause
    exit /b 1
)

echo [OK] Initial data inserted
echo.

REM =========================================
REM Verify Setup
REM =========================================
echo ================================================
echo Verifying setup...
echo ================================================

"%MYSQL_PATH%\mysql.exe" -h %DB_HOST% -P %DB_PORT% -u %DB_USER% -p%DB_PASS% %DB_NAME% -e "SHOW TABLES; SELECT id, name, email, role, tokens FROM users;"

echo.
echo ================================================
echo         SETUP COMPLETE!
echo ================================================
echo.
echo Database Information:
echo    Database: %DB_NAME%
echo    MySQL User: %DB_USER%
echo.
echo Admin Account:
echo    Email: nguyenphuckhuongceo@gmail.com
echo    Password: 123456
echo    Tokens: 1000
echo.
echo Test Account:
echo    Email: user@test.com
echo    Password: 123456
echo    Tokens: 100
echo.
echo ================================================
echo Next Steps:
echo ================================================
echo 1. Start backend:
echo    cd ..\api_base
echo    venv\Scripts\activate
echo    python run_api.py
echo.
echo 2. Open Swagger UI:
echo    http://localhost:8000/docs
echo.
echo 3. Login and test Payment API
echo ================================================
echo.

pause
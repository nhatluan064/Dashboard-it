@echo off
title IT Dashboard Management System
color 0A

echo ============================================
echo    IT Dashboard Management System
echo    Quan ly mang noi bo
echo ============================================
echo.

cd /d "%~dp0backend"

:: Kiem tra Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Khong tim thay Python. Vui long cai dat Python 3.12+
    echo Download: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Kiem tra Flask
python -c "import flask" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Dang cai dat dependencies...
    pip install -r requirements.txt
    echo.
)

echo.
echo [OK] Dang khoi dong server...
echo [OK] Mo truy duyet web: http://127.0.0.1:5000
echo [OK] Nhan Ctrl+C de dung server
echo.

:: Tu dong mo trinh duyet sau 2 giay
start "" /b cmd /c "timeout /t 2 >nul && start http://127.0.0.1:5000"

:: Chay Flask server
python app.py

pause

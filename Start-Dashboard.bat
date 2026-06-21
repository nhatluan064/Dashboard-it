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

echo [OK] Dang check xem port 5000 co bi chiem dung khong...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
    echo [WARNING] Port 5000 dang bi chiem boi PID %%a. Dang giai phong port...
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo [OK] Dang khoi dong server...
echo [OK] Mo trinh duyet web: http://127.0.0.1:5000
echo [OK] Nhan Ctrl+C de dung server
echo.

:: Tu dong mo trinh duyet sau 3 giay (dung ping de delay an toan hon timeout)
start "" /b cmd /c "ping 127.0.0.1 -n 4 >nul && start http://127.0.0.1:5000"

:: Chay Flask server
python app.py

pause

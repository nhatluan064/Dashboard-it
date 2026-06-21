@echo off
setlocal EnableExtensions EnableDelayedExpansion
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
if errorlevel 1 (
    echo [ERROR] Khong tim thay Python. Vui long cai dat Python 3.12+
    echo Download: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Kiem tra Flask
python -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Dang cai dat dependencies...
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Cai dat dependencies that bai.
        pause
        exit /b 1
    )
)

:: Giai phong port 5000 neu dang bi chiem dung
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
    echo [WARNING] Port 5000 dang bi chiem boi PID %%a. Dang giai phong port...
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo [OK] Dang khoi dong server...
echo [OK] Dang cho server san sang...
echo.

:: Mo browser sau khi server san sang
start "" cmd /c "ping 127.0.0.1 -n 3 >nul && start http://127.0.0.1:5000"

:: Chay Flask server (cua so nay se giu server)
python app.py
set EXIT_CODE=%errorlevel%

echo.
if not "%EXIT_CODE%"=="0" (
    echo [ERROR] Server dung voi ma loi %EXIT_CODE%.
) else (
    echo [OK] Server da dung.
)

pause
endlocal

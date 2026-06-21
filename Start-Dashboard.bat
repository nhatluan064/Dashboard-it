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

:: Kill any existing process on port 5000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
    echo [WARNING] Port 5000 dang bi chiem boi PID %%a. Dang giai phong port...
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo [OK] Dang khoi dong server...
echo [OK] Moi truong san sang. Dang cho server khoi dong...
echo.

:: Tu dong mo trinh duyet sau delay va kiem tra server
set /a MAX_WAIT=30
set /a ELAPSED=0
:waitloop
if %ELAPSED% geq %MAX_WAIT% goto :timeout
rem Check if server is responding
powershell -Command "& { try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5000' -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto :opened
timeout /t 1 >nul
set /a ELAPSED+=1
goto :waitloop
:timeout
echo [WARNING] Khong the ket noi den server sau %MAX_WAIT% giay. Server co the van dang khoi dong.
:opened
echo [OK] Da mo trinh duyet: http://127.0.0.1:5000
start "" "" http://127.0.0.1:5000

echo.
echo [OK] Server dang chay. Nhap Ctrl+C de dung server.
pause
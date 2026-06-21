@echo off
title Stop IT Dashboard
color 0C

echo Dang dung IT Dashboard Server bang cach giai phong port 5000...
echo.

set found=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
    echo [+] Dang kill process PID %%a dang chay tren port 5000...
    taskkill /f /pid %%a >nul 2>&1
    set found=1
)

if %found%==0 (
    echo [INFO] Khong tim thay process nao dang chay tren port 5000.
) else (
    echo [OK] Da dung IT Dashboard Server.
)

echo.
timeout /t 3

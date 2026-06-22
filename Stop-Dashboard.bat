@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Stop IT Dashboard
color 0C

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "PIDFILE=%BACKEND%\dashboard.pid"

echo Dang dung IT Dashboard Server...
echo.

set "KILLED=0"

if exist "%PIDFILE%" (
    for /f "usebackq delims=" %%p in ("%PIDFILE%") do set "PID=%%p"
    if defined PID (
        echo [+] Dang dung server theo PID file: %PID%
        taskkill /f /pid %PID% >nul 2>&1
        if not errorlevel 1 set "KILLED=1"
    )
)

if "%KILLED%"=="0" (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
        echo [+] Dang kill process PID %%a dang chay tren port 5000...
        taskkill /f /pid %%a >nul 2>&1
        if not errorlevel 1 set "KILLED=1"
    )
)

if "%KILLED%"=="0" (
    echo [INFO] Khong tim thay process nao dang chay tren port 5000.
) else (
    echo [OK] Da dung IT Dashboard Server.
    if exist "%PIDFILE%" del /f /q "%PIDFILE%" >nul 2>&1
)

echo.
timeout /t 1 >nul
endlocal

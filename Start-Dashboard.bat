@echo off
setlocal EnableExtensions EnableDelayedExpansion
title IT Dashboard Management System
color 0A

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "PIDFILE=%BACKEND%\dashboard.pid"
set "LOGFILE=%BACKEND%\dashboard.log"
set "PYTHON=python"

echo ============================================
echo    IT Dashboard Management System
echo    Quan ly mang noi bo
echo ============================================
echo.

cd /d "%BACKEND%"

:: Kiem tra Python
where %PYTHON% >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Khong tim thay Python. Vui long cai dat Python 3.12+
    echo Download: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Kiem tra Flask
%PYTHON% -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Dang cai dat dependencies...
    %PYTHON% -m pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Cai dat dependencies that bai.
        pause
        exit /b 1
    )
)

:: Neu da co PID thi thu stop truoc
if exist "%PIDFILE%" (
    for /f "usebackq delims=" %%p in ("%PIDFILE%") do set "OLDPID=%%p"
    if not "%OLDPID%"=="" (
        tasklist /fi "PID eq %OLDPID%" | find "%OLDPID%" >nul 2>&1
        if not errorlevel 1 (
            echo [INFO] Da phat hien server cu PID %OLDPID%. Dang dung truoc khi khoi dong moi...
            taskkill /f /pid %OLDPID% >nul 2>&1
            timeout /t 1 >nul
        )
    )
)

:: Giai phong port 5000 neu bi chiem dung boi process khac
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
    echo [WARNING] Port 5000 dang bi chiem boi PID %%a. Dang giai phong port...
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo [OK] Dang khoi dong server...
echo [OK] Dang cho server san sang...
echo.

:: Chay server trong cua so rieng de co PID va khong block batch
start "IT Dashboard Server" /b cmd /c "cd /d \"%BACKEND%\" && %PYTHON% app.py > \"%LOGFILE%\" 2>&1"

:: Luu PID cua python dang chay gan nhat tren port 5000 vao PID file
set "APPPID="
for /l %%i in (1,1,30) do (
    for /f "tokens=5" %%p in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do set "APPPID=%%p"
    if defined APPPID goto :pidfound
    timeout /t 1 >nul
)

:pidfound
if not defined APPPID (
    echo [WARNING] Khong lay duoc PID server. Vui long xem log tai:
    echo %LOGFILE%
) else (
    > "%PIDFILE%" echo %APPPID%
    echo [OK] Da luu PID server: %APPPID%
)

:: Mo browser khi port 5000 san sang
set /a ELAPSED=0
:waitloop
if %ELAPSED% geq 30 goto :openbrowser
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5000' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto :openbrowser
timeout /t 1 >nul
set /a ELAPSED+=1
goto :waitloop

:openbrowser
start "" "http://127.0.0.1:5000"
echo [OK] Da mo trinh duyet: http://127.0.0.1:5000
echo.
echo [OK] Nen de cua so nay mo de xem log nhanh.
echo [OK] Hoac nhan Ctrl+C neu muon dung terminal nay.
pause
endlocal

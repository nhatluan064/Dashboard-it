@echo off
title Stop IT Dashboard
color 0C

echo Dang dung IT Dashboard Server...
taskkill /f /im python.exe /fi "WINDOWTITLE eq IT Dashboard*" >nul 2>&1
taskkill /f /im python.exe >nul 2>&1

echo.
echo [OK] Server da dung.
timeout /t 3

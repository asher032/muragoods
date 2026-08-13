@echo off
REM Muragoods GitHub Push Script
REM This script commits your code and pushes it to GitHub

setlocal enabledelayedexpansion

cd /d "C:\Users\marya\OneDrive\muragoods"

echo.
echo ========================================
echo Muragoods - Push to GitHub
echo ========================================
echo.

REM Check if git is available
where git >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed or not in PATH
    echo Please restart your computer and try again
    pause
    exit /b 1
)

echo [1/4] Configuring git user...
git config --global user.email "muragoods@local"
git config --global user.name "Muragoods"

echo [2/4] Adding files to git...
git add .

echo [3/4] Creating initial commit...
git commit -m "Initial Muragoods storefront commit"

echo [4/4] Adding GitHub remote and pushing...
git remote add origin https://github.com/asher032/muragoods 2>nul
git branch -M main
git push -u origin main

echo.
echo ========================================
echo SUCCESS!
echo ========================================
echo Your code has been pushed to GitHub!
echo.
echo Next step: Set up Vercel at https://vercel.com
echo.
pause

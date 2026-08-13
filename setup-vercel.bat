@echo off
REM Muragoods Vercel Setup Script
REM This script initializes git and prepares your app for GitHub + Vercel deployment

cd /d "C:\Users\marya\OneDrive\muragoods"

echo.
echo ========================================
echo Muragoods Vercel Setup
echo ========================================
echo.

REM Configure git (if not already done)
git config --global user.email "muragoods@local"
git config --global user.name "Muragoods"

REM Add all files to git
echo [1/3] Adding files to git...
git add .

REM Create initial commit
echo [2/3] Creating initial commit...
git commit -m "Initial Muragoods storefront"

REM Display status
echo [3/3] Git repository ready!
echo.
echo ========================================
echo NEXT STEPS:
echo ========================================
echo.
echo 1. Go to https://github.com and create a free account
echo 2. Create a new repository called "muragoods"
echo 3. Go to https://vercel.com and sign up with GitHub
echo 4. Import your muragoods GitHub repository
echo 5. Vercel will automatically deploy your app!
echo.
echo Once you've created the GitHub repo, send me the link
echo and I'll push your code to GitHub and set up Vercel.
echo.
pause

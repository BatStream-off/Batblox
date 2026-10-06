@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est requis : https://nodejs.org & pause & exit /b 1)
call npm install --no-audit --no-fund || (pause & exit /b 1)
call npm test || (echo Les tests ont echoue. & pause & exit /b 1)
call npm run dist || (pause & exit /b 1)
echo.
echo Termine. L'installeur et la version portable sont dans le dossier "dist".
pause

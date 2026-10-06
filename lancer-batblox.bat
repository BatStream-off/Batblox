@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est requis : https://nodejs.org & pause & exit /b 1)
if not exist node_modules (
  echo Installation des composants, une seule fois...
  call npm install --no-audit --no-fund || (pause & exit /b 1)
)
call npm start

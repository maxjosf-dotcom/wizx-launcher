@echo off
title WizX Client
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo FEHLER: Node.js ist nicht installiert. Lade es von https://nodejs.org herunter ^(LTS^).
  pause
  exit /b 1
)
if not exist node_modules call npm install
call npm start

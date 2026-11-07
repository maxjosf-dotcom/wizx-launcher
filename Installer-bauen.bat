@echo off
title WizX Client - Installer bauen
cd /d "%~dp0"
echo ============================================
echo  WizX Client: Installer wird gebaut
echo  Das dauert beim ersten Mal einige Minuten.
echo ============================================
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo FEHLER: Node.js ist nicht installiert.
  echo Lade es von https://nodejs.org herunter ^(LTS^) und starte diese Datei erneut.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 goto fehler
call npm run dist
if errorlevel 1 goto fehler
echo.
echo FERTIG! Der Installer liegt im Ordner "release".
start "" "%~dp0release"
pause
exit /b 0
:fehler
echo.
echo Es ist ein Fehler aufgetreten. Schick mir die Meldung oben.
pause
exit /b 1

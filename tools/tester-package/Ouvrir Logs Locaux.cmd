@echo off
setlocal
set "LOG_DIR=%LOCALAPPDATA%\StreamVolumeGuard\logs"

if not exist "%LOG_DIR%" (
    echo Aucun dossier de logs trouve pour le moment :
    echo %LOG_DIR%
    echo Lance l'application une premiere fois, puis relance ce raccourci.
    pause
    exit /b 1
)

start "" "%LOG_DIR%"

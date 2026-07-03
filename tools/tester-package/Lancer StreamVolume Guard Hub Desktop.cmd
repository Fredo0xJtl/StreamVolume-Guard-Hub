@echo off
setlocal
cd /d "%~dp0"

set "APP_EXE=desktop\StreamVolumeGuard.App.exe"

if not exist "%APP_EXE%" (
    echo StreamVolume Guard Hub Desktop est introuvable.
    echo Executable attendu : %APP_EXE%
    echo Relance tools\package-tester.ps1 depuis le repo source pour reconstruire le package.
    pause
    exit /b 1
)

echo Ouverture de StreamVolume Guard Hub Desktop...
start "" "%~dp0%APP_EXE%"

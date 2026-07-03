@echo off
setlocal
cd /d "%~dp0"

set "PROJECT=apps\desktop\src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj"
set "APP_EXE=apps\desktop\src\StreamVolumeGuard.App\bin\Debug\net8.0-windows\StreamVolumeGuard.App.exe"
set "MSBUILDDISABLENODEREUSE=1"

echo Lancement de StreamVolume Guard Hub Desktop depuis le repo hybride...
echo.

echo Liberation des caches de build .NET...
dotnet build-server shutdown >nul 2>nul

echo Compilation de l'application desktop...
dotnet build "%PROJECT%" -nr:false

if errorlevel 1 (
    echo.
    echo Echec de compilation. Verifie que .NET SDK 8 est installe.
    echo Si l'erreur parle de MarkupCompile.cache, ferme les anciennes fenetres de build puis relance ce script.
    echo Projet attendu : %PROJECT%
    pause
    exit /b 1
)

echo.
echo Ouverture de StreamVolume Guard Hub Desktop...
"%APP_EXE%"

if errorlevel 1 (
    echo.
    echo L'application s'est arretee avec une erreur.
    echo Executable attendu : %APP_EXE%
    pause
    exit /b 1
)

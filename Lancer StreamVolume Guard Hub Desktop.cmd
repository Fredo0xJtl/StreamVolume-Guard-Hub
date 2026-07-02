@echo off
setlocal
cd /d "%~dp0"

echo Lancement de StreamVolume Guard Hub Desktop depuis le repo hybride...
echo.

dotnet run --project "apps\desktop\src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj"

if errorlevel 1 (
    echo.
    echo Echec du lancement. Verifie que .NET SDK 8 est installe.
    echo Projet attendu : apps\desktop\src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj
    pause
)

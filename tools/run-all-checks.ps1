param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    Write-Host "==> $Command"
    $output = Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Échec de la commande: $Command"
    }
    return $output
}

Set-Location "D:\Codex\StreamVolume Guard Hybride"

Invoke-Step 'node "packages/protocol/tests/protocol.test.js"'
Invoke-Step 'node "apps/browser-extension/tests/unit.test.js"'
Invoke-Step 'node --check "apps/browser-extension/audio/browser-gain-calibration.js"'
Invoke-Step 'node --check "apps/browser-extension/audio/normalizer.js"'
Invoke-Step 'node --check "apps/browser-extension/bridge/client.js"'
Invoke-Step 'node --check "apps/browser-extension/background.js"'
Invoke-Step 'node --check "apps/browser-extension/content.js"'
Invoke-Step 'node --check "apps/browser-extension/offscreen/offscreen.js"'
Invoke-Step 'node --check "apps/browser-extension/popup/popup.js"'
Invoke-Step 'node --check "apps/browser-extension/options/options.js"'
Invoke-Step 'dotnet run --project "apps/desktop/tests/StreamVolumeGuard.Tests/StreamVolumeGuard.Tests.csproj"'
Invoke-Step 'dotnet build "apps/desktop/StreamVolumeGuard.Desktop.sln" -nr:false'

Write-Host "Toutes les vérifications ont réussi."

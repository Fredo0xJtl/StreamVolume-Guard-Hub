param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$artifactRoot = Join-Path $root "artifacts\tester"
$packageRoot = Join-Path $artifactRoot "StreamVolumeGuardHub-Tester"
$desktopProject = Join-Path $root "apps\desktop\src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj"
$desktopOutput = Join-Path $packageRoot "desktop"
$extensionSource = Join-Path $root "apps\browser-extension"
$extensionOutput = Join-Path $packageRoot "browser-extension"
$templatesRoot = Join-Path $root "tools\tester-package"
$docsRoot = Join-Path $root "docs\tester-package"

function Assert-PathInside {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Parent
    )

    $resolvedParent = [System.IO.Path]::GetFullPath($Parent)
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $resolvedPath.StartsWith($resolvedParent, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to write outside $resolvedParent : $resolvedPath"
    }
}

function Copy-RequiredItem {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        throw "Missing package source: $Source"
    }

    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}

Assert-PathInside -Path $packageRoot -Parent $artifactRoot

if (Test-Path -LiteralPath $packageRoot) {
    Remove-Item -LiteralPath $packageRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $desktopOutput, $extensionOutput | Out-Null

Write-Host "Stopping stale .NET build servers..."
dotnet build-server shutdown | Out-Null

Write-Host "Publishing StreamVolume Guard Hub Desktop..."
dotnet publish $desktopProject -c $Configuration -r win-x64 --self-contained false -o $desktopOutput -nr:false

Write-Host "Copying browser extension files..."
$extensionItems = @(
    "manifest.json",
    "background.js",
    "content.js",
    "_locales",
    "assets",
    "audio",
    "bridge",
    "license",
    "offscreen",
    "options",
    "popup",
    "storage"
)

foreach ($item in $extensionItems) {
    Copy-RequiredItem -Source (Join-Path $extensionSource $item) -Destination (Join-Path $extensionOutput $item)
}

# Keep generated or developer-only extension outputs out of the tester package:
# dist, build, out, release-assets, release, releases, graphify-out, node_modules, tests, tools.

Copy-RequiredItem -Source (Join-Path $templatesRoot "Lancer StreamVolume Guard Hub Desktop.cmd") -Destination (Join-Path $packageRoot "Lancer StreamVolume Guard Hub Desktop.cmd")
Copy-RequiredItem -Source (Join-Path $templatesRoot "Ouvrir Logs Locaux.cmd") -Destination (Join-Path $packageRoot "Ouvrir Logs Locaux.cmd")
Copy-RequiredItem -Source (Join-Path $docsRoot "README.md") -Destination (Join-Path $packageRoot "README.md")
Copy-RequiredItem -Source (Join-Path $docsRoot "CHECKLIST.md") -Destination (Join-Path $packageRoot "CHECKLIST.md")
Copy-RequiredItem -Source (Join-Path $root "docs\tester-checklist.md") -Destination (Join-Path $packageRoot "CHECKLIST-COMPLETE.md")

Write-Host ""
Write-Host "Tester package ready:"
Write-Host $packageRoot
Write-Host ""
Write-Host "Open README.md first, then double-click 'Lancer StreamVolume Guard Hub Desktop.cmd'."

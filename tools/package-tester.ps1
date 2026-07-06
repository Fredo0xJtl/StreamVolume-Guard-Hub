param(
    [string]$Configuration = "Release",
    [string]$Version = "0.1.38"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$artifactRoot = Join-Path $root "artifacts\tester"
$packageRoot = Join-Path $artifactRoot "StreamVolumeGuardHub-Tester"
$archivePath = Join-Path $artifactRoot "StreamVolumeGuardHub-Tester-v$Version.zip"
$archiveChecksumPath = "$archivePath.sha256.txt"
$desktopProject = Join-Path $root "apps\desktop\src\StreamVolumeGuard.App\StreamVolumeGuard.App.csproj"
$extensionSource = Join-Path $root "apps\browser-extension"
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

function Resolve-StagedPackageRoot {
    param([string]$DesiredRoot)

    if (-not (Test-Path -LiteralPath $DesiredRoot)) {
        return $DesiredRoot
    }

    $removeAttempts = 0
    while ($removeAttempts -lt 3) {
        try {
            Remove-Item -LiteralPath $DesiredRoot -Recurse -Force -ErrorAction Stop
            return $DesiredRoot
        }
        catch {
            Write-Host "Cleanup attempt $($removeAttempts + 1) failed: $($_.Exception.Message)"
            Start-Sleep -Milliseconds 500
            $removeAttempts++
        }
    }

    try {
        Write-Host "Primary remove still locked, retry with alternate CMD method"
        cmd /c "rmdir /S /Q `"$DesiredRoot`"" | Out-Null
        if (-not (Test-Path -LiteralPath $DesiredRoot)) {
            return $DesiredRoot
        }
    }
    catch {
        Write-Host "Alternate remove failed: $($_.Exception.Message)"
    }

    $fallbackRoot = "$DesiredRoot-$((Get-Date).ToString('yyyyMMddHHmmss'))-$PID"
    $fallbackInArtifacts = $fallbackRoot
    try {
        if (-not (Test-Path -LiteralPath $fallbackInArtifacts)) {
            New-Item -ItemType Directory -Path $fallbackInArtifacts -Force -ErrorAction Stop | Out-Null
            Remove-Item -LiteralPath $fallbackInArtifacts -Recurse -Force -ErrorAction Stop
        }
        Write-Host "Package directory is locked. Using fallback staging folder: $fallbackInArtifacts"
        return $fallbackInArtifacts
    }
    catch {
        Write-Host "Fallback staging folder in artifacts is not accessible: $($_.Exception.Message)"
    }

    $tempFallbackRoot = Join-Path $env:TEMP "StreamVolumeGuardHub-Tester-$PID-$((Get-Date).ToString('yyyyMMddHHmmss'))"
    try {
        New-Item -ItemType Directory -Path $tempFallbackRoot -Force -ErrorAction Stop | Out-Null
        Remove-Item -LiteralPath $tempFallbackRoot -Recurse -Force -ErrorAction Stop
        Write-Host "Using temp staging fallback folder: $tempFallbackRoot"
        return $tempFallbackRoot
    }
    catch {
        Write-Host "Temp staging fallback unavailable: $($_.Exception.Message)"
    }

    Write-Host "Package directory is locked. Using fallback staging folder: $fallbackRoot"
    throw "Unable to create a writable staging folder for the tester package."
}

Assert-PathInside -Path $packageRoot -Parent $artifactRoot
$packageRoot = Resolve-StagedPackageRoot -DesiredRoot $packageRoot
$desktopOutput = Join-Path $packageRoot "desktop"
$extensionOutput = Join-Path $packageRoot "browser-extension"

if ($packageRoot -like "*-$PID") {
    $archivePath = Join-Path $artifactRoot "StreamVolumeGuardHub-Tester-fallback-v$Version-$($packageRoot.Split('-')[-1]).zip"
    $archiveChecksumPath = "$archivePath.sha256.txt"
}

if (Test-Path -LiteralPath $archivePath) {
    try {
        Remove-Item -LiteralPath $archivePath -Force
    }
    catch {
        Write-Host "Unable to remove existing archive '$archivePath': $($_.Exception.Message)"
        if (-not ($archivePath -like "*-fallback-*")) {
            Write-Host "Using fallback archive path to avoid lock."
            $archivePath = Join-Path $artifactRoot "StreamVolumeGuardHub-Tester-v$Version-$PID-$((Get-Date).ToString('yyyyMMddHHmmss')).zip"
            $archiveChecksumPath = "$archivePath.sha256.txt"
            Write-Host "Fallback archive path: $archivePath"
        } else {
            throw "Unable to remove existing archive '$archivePath'."
        }
    }
}

if (Test-Path -LiteralPath $archiveChecksumPath) {
    try {
        Remove-Item -LiteralPath $archiveChecksumPath -Force
    }
    catch {
        Write-Host "Unable to remove existing checksum '$archiveChecksumPath': $($_.Exception.Message)"
    }
}

New-Item -ItemType Directory -Force -Path $desktopOutput, $extensionOutput | Out-Null

Write-Host "Stopping stale .NET build servers..."
dotnet build-server shutdown | Out-Null

Write-Host "Publishing StreamVolume Guard Hub Desktop..."
dotnet publish $desktopProject -c $Configuration -r win-x64 --self-contained true -o $desktopOutput -nr:false

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
Copy-RequiredItem -Source (Join-Path $root "LICENSE") -Destination (Join-Path $packageRoot "LICENSE")

Write-Host "Creating tester zip..."
Compress-Archive -LiteralPath $packageRoot -DestinationPath $archivePath -Force

Write-Host "Creating SHA256 checksum..."
$archiveHash = Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
$checksumLine = "{0}  {1}" -f $archiveHash.Hash.ToLowerInvariant(), (Split-Path -Leaf $archivePath)
Set-Content -LiteralPath $archiveChecksumPath -Value $checksumLine -Encoding ASCII

Write-Host ""
Write-Host "Tester package ready:"
Write-Host $packageRoot
Write-Host $archivePath
Write-Host $archiveChecksumPath
Write-Host ""
Write-Host "Open README.md first, verify the checksum when sharing the zip, then double-click 'Lancer StreamVolume Guard Hub Desktop.cmd'."

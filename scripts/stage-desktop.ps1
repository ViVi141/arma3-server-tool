#Requires -Version 5.1
# Stage web dist + Node service runtime for electron-builder extraResources.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$WebDist = Join-Path $Root "packages\web\dist"
$ServiceDist = Join-Path $Root "packages\service\dist"
$StageRoot = Join-Path $Root "apps\desktop\electron-resources"
$StageWeb = Join-Path $StageRoot "web"
$StageService = Join-Path $StageRoot "service"
$StageAssets = Join-Path $StageRoot "assets"
$BuildDir = Join-Path $Root "apps\desktop\build"

function Require-Path {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path,

        [Parameter(Mandatory = $true)]
        [string] $Hint
    )

    if (-not (Test-Path $Path)) {
        throw "Missing path: $Path`n$Hint"
    }
}

Require-Path -Path $WebDist -Hint "Run: npm run build:web -- --base ./"
Require-Path -Path (Join-Path $WebDist "index.html") -Hint "Web build output is incomplete."
Require-Path -Path $ServiceDist -Hint "Run: npm run build:service"
Require-Path -Path (Join-Path $ServiceDist "index.js") -Hint "Service build output is incomplete."

Write-Host "Staging Electron resources -> $StageRoot"

if (Test-Path $StageRoot) {
    Remove-Item -Recurse -Force $StageRoot
}

New-Item -ItemType Directory -Path $StageWeb -Force | Out-Null
New-Item -ItemType Directory -Path $StageService -Force | Out-Null
New-Item -ItemType Directory -Path $StageAssets -Force | Out-Null

Copy-Item -Path (Join-Path $WebDist "*") -Destination $StageWeb -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $StageService "dist") -Force | Out-Null
Copy-Item -Path (Join-Path $ServiceDist "*") -Destination (Join-Path $StageService "dist") -Recurse -Force

$srcPkgPath = Join-Path $Root "packages\service\package.json"
Require-Path -Path $srcPkgPath -Hint "Service package.json missing."
$srcPkg = Get-Content -Raw -Path $srcPkgPath | ConvertFrom-Json
if (-not $srcPkg.dependencies) {
    throw "packages/service/package.json has no dependencies."
}

$runtimePkg = @{
    name = "a3st-service-runtime"
    private = $true
    type = "module"
    version = [string]$srcPkg.version
    dependencies = $srcPkg.dependencies
}
$runtimePath = Join-Path $StageService "package.json"
$runtimeJson = $runtimePkg | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($runtimePath, $runtimeJson)

Write-Host "Installing production service dependencies ..."
Push-Location $StageService
try {
    npm install --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed in staged service directory."
    }
    foreach ($depName in @($srcPkg.dependencies.PSObject.Properties.Name)) {
        $depPkg = Join-Path $StageService ("node_modules\" + ($depName -replace "/", "\") + "\package.json")
        if (-not (Test-Path $depPkg)) {
            throw "Staged service missing dependency: $depName"
        }
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
}

$IconTarget = Join-Path $BuildDir "icon.ico"
Require-Path -Path $IconTarget -Hint "Place icon.ico in apps/desktop/build/"

Copy-Item -Path $IconTarget -Destination (Join-Path $StageAssets "icon.ico") -Force

Write-Host "Electron resources staged."
Write-Host "  Web:     $StageWeb"
Write-Host "  Service: $StageService"
Write-Host "  Assets:  $StageAssets"

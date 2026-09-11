<#
.SYNOPSIS
  Build debug APK for @a3st/mobile (Capacitor + Vue).

.NOTES
  Requires Android SDK + JDK (Android Studio JBR is fine).
#>
$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$MobileDir = Join-Path $RepoRoot "apps\mobile"
$Sdk = $env:ANDROID_HOME
if (-not $Sdk -or -not (Test-Path $Sdk)) {
  $Sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
if (-not (Test-Path $Sdk)) {
  throw "ANDROID_HOME / Android SDK not found. Install Android Studio first."
}

$JavaHome = $env:JAVA_HOME
if (-not $JavaHome -or -not (Test-Path $JavaHome)) {
  $jbr = "C:\Program Files\Android\Android Studio\jbr"
  if (Test-Path $jbr) {
    $JavaHome = $jbr
  }
}
if (-not $JavaHome -or -not (Test-Path $JavaHome)) {
  throw "JAVA_HOME not found. Install JDK 17+ or Android Studio."
}

$env:ANDROID_HOME = $Sdk
$env:ANDROID_SDK_ROOT = $Sdk
$env:JAVA_HOME = $JavaHome
$env:Path = "$(Join-Path $JavaHome 'bin');$(Join-Path $Sdk 'platform-tools');$env:Path"

Set-Location $RepoRoot
Write-Host "==> Build mobile web (VITE_APP_MODE=mobile)"
npm run build:web:mobile
if ($LASTEXITCODE -ne 0) {
  throw "web mobile build failed"
}

Set-Location $MobileDir
Write-Host "==> Capacitor sync android"
npx --yes cap sync android
if ($LASTEXITCODE -ne 0) {
  throw "cap sync failed"
}

Write-Host "==> Ensure cleartext HTTP for LAN"
powershell -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\ensure-mobile-cleartext.ps1")

$Gradle = Join-Path $MobileDir "android\gradlew.bat"
if (-not (Test-Path $Gradle)) {
  throw "android/ project missing. Run: npm -w @a3st/mobile exec -- cap add android"
}

Write-Host "==> Gradle assembleDebug"
Set-Location (Join-Path $MobileDir "android")
& .\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) {
  throw "gradle assembleDebug failed"
}

$Apk = Join-Path $MobileDir "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $Apk)) {
  throw "APK not found: $Apk"
}

$OutDir = Join-Path $RepoRoot "artifacts\mobile"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Dest = Join-Path $OutDir "a3st-mobile-debug.apk"
Copy-Item $Apk $Dest -Force
Write-Host "APK ready: $Dest"
Write-Host "Install: adb install -r `"$Dest`""

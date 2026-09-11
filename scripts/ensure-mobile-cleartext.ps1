<#
.SYNOPSIS
  Ensure Android cleartext HTTP is allowed for LAN Service URLs.
  Safe to re-run after `npx cap add android`.
#>
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\apps\mobile\android")
$Manifest = Join-Path $Root "app\src\main\AndroidManifest.xml"
$XmlDir = Join-Path $Root "app\src\main\res\xml"
$Nsc = Join-Path $XmlDir "network_security_config.xml"

if (-not (Test-Path $Manifest)) {
  throw "AndroidManifest.xml not found. Run cap add android first."
}

New-Item -ItemType Directory -Force -Path $XmlDir | Out-Null
@'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
'@ | Set-Content -Path $Nsc -Encoding utf8

$xml = Get-Content $Manifest -Raw
if ($xml -notmatch 'usesCleartextTraffic') {
  $xml = $xml -replace 'android:theme="@style/AppTheme">', @'
android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true"
        android:networkSecurityConfig="@xml/network_security_config">
'@
  Set-Content -Path $Manifest -Value $xml -Encoding utf8
  Write-Host "Patched AndroidManifest.xml for cleartext HTTP"
} else {
  Write-Host "AndroidManifest.xml already allows cleartext"
}

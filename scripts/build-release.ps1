#Requires -Version 5.1

param(

    [ValidateSet("Release", "Debug")]

    [string] $Configuration = "Release",

    [switch] $SelfContained,

    [string] $Version = "1.0.0"

)



$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot

Set-Location $Root



Write-Host "Building Arma3ServerTools v$Version ($Configuration)..."



dotnet restore Arma3ServerTools.sln

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }



dotnet build Arma3ServerTools.sln -c $Configuration --no-restore

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }



dotnet test Arma3ServerTools.sln -c $Configuration --no-build

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }



$ArtifactName = "Arma3ServerTools-v$Version-$Configuration"

if ($SelfContained) {

    $ArtifactName = $ArtifactName + "-win-x64"

}



$PublishDir = Join-Path $Root "artifacts\$ArtifactName"

if (Test-Path $PublishDir) {

    Remove-Item -Recurse -Force $PublishDir

}



$PublishArgs = @(

    "publish",

    "src\Arma3ServerTools.App.WinForms\Arma3ServerTools.App.WinForms.csproj",

    "-c", $Configuration,

    "-o", $PublishDir,

    "--no-build"

)



if ($SelfContained) {

    $PublishArgs += @("-r", "win-x64", "--self-contained", "true")

}

else {

    $PublishArgs += @("--self-contained", "false")

}



dotnet @PublishArgs

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$MonitoringSource = Join-Path $Root "src\Arma3ServerTools.App.WinForms\bin\$Configuration\net10.0-windows\monitoring"
if (Test-Path $MonitoringSource) {
    $MonitoringDest = Join-Path $PublishDir "monitoring"
    if (Test-Path $MonitoringDest) {
        Remove-Item -Recurse -Force $MonitoringDest
    }
    Copy-Item -Path $MonitoringSource -Destination $MonitoringDest -Recurse -Force
}

foreach ($legalFile in @("LICENSE", "NOTICE", "THIRD-PARTY-NOTICES.txt")) {

    $sourcePath = Join-Path $Root $legalFile

    if (Test-Path $sourcePath) {

        Copy-Item -Path $sourcePath -Destination (Join-Path $PublishDir $legalFile) -Force

    }

}



$ZipPath = Join-Path $Root "artifacts\$ArtifactName.zip"

if (Test-Path $ZipPath) {

    Remove-Item -Force $ZipPath

}

Compress-Archive -Path (Join-Path $PublishDir "*") -DestinationPath $ZipPath



Write-Host ""

Write-Host "Release output: $PublishDir"

Write-Host "Release zip:    $ZipPath"

Write-Host "Main executable: $(Join-Path $PublishDir 'Arma3ServerTools.exe')"

Write-Host ""

Write-Host "To publish GitHub Release v${Version}:"

Write-Host "  1. Commit all changes"

Write-Host "  2. git tag -a v${Version} -m ""Arma3 Server Tools v${Version}"""

Write-Host "  3. git push origin v${Version}"

Write-Host "  4. Upload $ZipPath to GitHub Releases"



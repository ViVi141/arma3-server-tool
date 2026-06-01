#Requires -Version 5.1
# Mirrors .github/workflows/ci.yml for local pre-commit verification.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Invoke-Step {
    param(
        [string] $Name,
        [scriptblock] $Action
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $Name (exit $LASTEXITCODE)"
    }
}

Write-Host "Arma3 Server Tools — local CI" -ForegroundColor Green

Invoke-Step "Restore" { dotnet restore Arma3ServerTools.sln }
Invoke-Step "Build solution" { dotnet build Arma3ServerTools.sln -c Release --no-restore }
Invoke-Step "Build Agent" {
    dotnet build src/Arma3ServerTools.Agent.Host/Arma3ServerTools.Agent.Host.csproj -c Release --no-restore
}
Invoke-Step "Test Core" {
    dotnet test tests/Arma3ServerTools.Core.Tests/Arma3ServerTools.Core.Tests.csproj -c Release --no-build --verbosity normal
}
Invoke-Step "Test Application" {
    dotnet test tests/Arma3ServerTools.Application.Tests/Arma3ServerTools.Application.Tests.csproj -c Release --no-build --verbosity normal --filter "FullyQualifiedName!~SteamCmdService&FullyQualifiedName!~SteamCmdExecutionGate"
}
Invoke-Step "Verify formatting" {
    dotnet format Arma3ServerTools.sln --verify-no-changes --no-restore
}

Write-Host ""
Write-Host "Local CI passed." -ForegroundColor Green

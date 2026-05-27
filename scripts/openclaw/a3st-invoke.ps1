# Invoke Arma3 Server Tools Agent API (for OpenClaw exec / automation).
param(
    [string]$BaseUrl = $env:A3ST_AGENT_URL,
    [string]$Token = $env:A3ST_AGENT_TOKEN,
    [ValidateSet("health", "list", "status", "task", "")]
    [string]$Command = "",
    [string]$ServerUuid = "",
    [string]$ServerName = "",
    [string]$TaskFile = "",
    [string]$TaskJson = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    $BaseUrl = "http://127.0.0.1:19580"
}

$BaseUrl = $BaseUrl.TrimEnd("/")

function Get-AuthHeaders {
    $headers = @{ "Content-Type" = "application/json" }
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $headers["Authorization"] = "Bearer $Token"
    }
    return $headers
}

function Invoke-A3stGet {
    param([string]$Path)
    $uri = "$BaseUrl$Path"
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $uri = "$uri" + "?token=$Token"
    }
    return Invoke-RestMethod -Uri $uri -Method Get -Headers (Get-AuthHeaders)
}

function Invoke-A3stPost {
    param([string]$Path, [string]$Body)
    $uri = "$BaseUrl$Path"
    return Invoke-RestMethod -Uri $uri -Method Post -Headers (Get-AuthHeaders) -Body $Body
}

if (-not [string]::IsNullOrWhiteSpace($TaskFile)) {
    if (-not (Test-Path -LiteralPath $TaskFile)) {
        Write-Error "Task file not found: $TaskFile"
    }
    $TaskJson = Get-Content -LiteralPath $TaskFile -Raw -Encoding UTF8
    $Command = "task"
}

if ($Command -eq "" -and -not [string]::IsNullOrWhiteSpace($TaskJson)) {
    $Command = "task"
}

switch ($Command) {
    "health" {
        Invoke-A3stGet -Path "/api/v1/health" | ConvertTo-Json -Depth 6
        exit 0
    }
    "list" {
        Invoke-A3stGet -Path "/api/v1/servers" | ConvertTo-Json -Depth 6
        exit 0
    }
    "status" {
        if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
            $list = Invoke-A3stGet -Path "/api/v1/servers"
            if ($list.Count -eq 1) {
                $ServerUuid = $list[0].serverUuid
            }
            elseif (-not [string]::IsNullOrWhiteSpace($ServerName)) {
                foreach ($item in $list) {
                    if ($item.configName -eq $ServerName) {
                        $ServerUuid = $item.serverUuid
                        break
                    }
                }
            }
        }
        if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
            Write-Error "Specify -ServerUuid or -ServerName, or use a single-server setup."
        }
        Invoke-A3stGet -Path "/api/v1/servers/$ServerUuid/status" | ConvertTo-Json -Depth 6
        exit 0
    }
    "task" {
        if ([string]::IsNullOrWhiteSpace($TaskJson)) {
            Write-Error "Provide -TaskFile or -TaskJson for task command."
        }
        $result = Invoke-A3stPost -Path "/api/v1/task" -Body $TaskJson
        $result | ConvertTo-Json -Depth 8
        if (-not $result.success) {
            exit 1
        }
        exit 0
    }
    default {
        $chatBody = @{
            serverUuid = $ServerUuid
            serverName = $ServerName
            commands   = @(@{ action = $Command })
        }
        if ($Command -match "^(stop|start|restart|status|write_cfg|update_server|help)$") {
            $taskJsonBuilt = $chatBody | ConvertTo-Json -Depth 6 -Compress
            $result = Invoke-A3stPost -Path "/api/v1/task" -Body $taskJsonBuilt
            $result | ConvertTo-Json -Depth 8
            if (-not $result.success) {
                exit 1
            }
            exit 0
        }
        Write-Host @"
Usage:
  -Command health|list|status|stop|start|restart|task
  -TaskFile <path.json>   OR   -TaskJson '<json>'
  -ServerUuid / -ServerName (optional if only one server)
Env: A3ST_AGENT_URL, A3ST_AGENT_TOKEN
"@
        exit 2
    }
}

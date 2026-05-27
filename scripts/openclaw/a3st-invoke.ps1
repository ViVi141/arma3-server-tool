# Invoke Arma3 Server Tools Agent API (for OpenClaw exec / automation).
param(
    [string]$BaseUrl = $env:A3ST_AGENT_URL,
    [string]$Token = $env:A3ST_AGENT_TOKEN,
    [ValidateSet("health", "list", "status", "task", "actions", "logs", "rpt", "")]
    [string]$Command = "",
    [string]$LogKind = "rpt",
    [int]$LogTail = 200,
    [string]$LogFile = "",
    [string]$ServerUuid = "",
    [string]$ServerName = "",
    [string]$TaskFile = "",
    [string]$TaskJson = "",
    [switch]$Async,
    [string]$WaitTaskId = "",
    [string]$UploadModHtml = "",
    [string]$UploadMissionPbo = "",
    [string]$ModHtmlMode = "download_and_enable"
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

function Invoke-A3stPostMultipart {
    param([string]$Path, [string]$FilePath)
    $uri = "$BaseUrl$Path"
    $headers = @{}
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $headers["Authorization"] = "Bearer $Token"
    }
    $form = @{
        file = Get-Item -LiteralPath $FilePath
    }
    return Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Form $form
}

if (-not [string]::IsNullOrWhiteSpace($WaitTaskId)) {
    $poll = Invoke-A3stGet -Path "/api/v1/tasks/$WaitTaskId"
    $poll | ConvertTo-Json -Depth 8
    if ($poll.success -and $poll.data.status -eq "Succeeded") { exit 0 }
    if ($poll.success -and $poll.data.status -eq "Failed") { exit 1 }
    exit 2
}

if (-not [string]::IsNullOrWhiteSpace($UploadModHtml)) {
    if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
        Write-Error "UploadModHtml requires -ServerUuid"
    }
    $uri = "$BaseUrl/api/v1/servers/$ServerUuid/files/mod-list-html?mode=$ModHtmlMode"
    $headers = @{}
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $headers["Authorization"] = "Bearer $Token"
    }
    $form = @{ file = Get-Item -LiteralPath $UploadModHtml }
    $result = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Form $form
    $result | ConvertTo-Json -Depth 8
    if (-not $result.success) { exit 1 }
    exit 0
}

if (-not [string]::IsNullOrWhiteSpace($UploadMissionPbo)) {
    if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
        Write-Error "UploadMissionPbo requires -ServerUuid"
    }
    $uri = "$BaseUrl/api/v1/servers/$ServerUuid/files/mission-pbo?addToMissionList=true"
    $headers = @{}
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $headers["Authorization"] = "Bearer $Token"
    }
    $form = @{ file = Get-Item -LiteralPath $UploadMissionPbo }
    $result = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Form $form
    $result | ConvertTo-Json -Depth 8
    if (-not $result.success) { exit 1 }
    exit 0
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
    "actions" {
        Invoke-A3stGet -Path "/api/v1/actions" | ConvertTo-Json -Depth 8
        exit 0
    }
    "list" {
        Invoke-A3stGet -Path "/api/v1/servers" | ConvertTo-Json -Depth 6
        exit 0
    }
    "logs" {
        if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
            $list = Invoke-A3stGet -Path "/api/v1/servers"
            if ($list.Count -eq 1) { $ServerUuid = $list[0].serverUuid }
        }
        if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
            Write-Error "Specify -ServerUuid for logs."
        }
        $q = "kind=$LogKind"
        if ($LogTail -gt 0) { $q = "$q&tail=$LogTail" }
        if (-not [string]::IsNullOrWhiteSpace($LogFile)) {
            $encoded = [uri]::EscapeDataString($LogFile)
            Invoke-A3stGet -Path "/api/v1/servers/$ServerUuid/logs/read?$q&file=$encoded" | ConvertTo-Json -Depth 8
        }
        else {
            Invoke-A3stGet -Path "/api/v1/servers/$ServerUuid/logs/read?$q" | ConvertTo-Json -Depth 8
        }
        exit 0
    }
    "rpt" {
        if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
            $list = Invoke-A3stGet -Path "/api/v1/servers"
            if ($list.Count -eq 1) { $ServerUuid = $list[0].serverUuid }
        }
        if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
            Write-Error "Specify -ServerUuid for rpt."
        }
        $q = "tail=$LogTail"
        if (-not [string]::IsNullOrWhiteSpace($LogFile)) {
            $encoded = [uri]::EscapeDataString($LogFile)
            $q = "$q&file=$encoded"
        }
        Invoke-A3stGet -Path "/api/v1/servers/$ServerUuid/rpt?$q" | ConvertTo-Json -Depth 8
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
        if ($Async) {
            $doc = $TaskJson | ConvertFrom-Json
            $doc | Add-Member -NotePropertyName async -NotePropertyValue $true -Force
            $TaskJson = $doc | ConvertTo-Json -Depth 10 -Compress
        }
        $result = Invoke-A3stPost -Path "/api/v1/task" -Body $TaskJson
        $result | ConvertTo-Json -Depth 8
        if ($result.success -eq $false -and $result.Success -eq $false) {
            exit 1
        }
        if ($result.data -and $result.data.taskId) {
            Write-Host "Poll: -WaitTaskId $($result.data.taskId)"
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
            if (-not $result.success -and -not $result.Success) {
                exit 1
            }
            exit 0
        }
        Write-Host @"
Usage:
  -Command health|actions|list|status|logs|rpt|stop|start|restart|task
  -LogKind rpt|battleye|all   -LogTail 200   -LogFile <fileName.rpt>  (with logs/rpt)
  -TaskFile <path.json>   OR   -TaskJson '<json>'   [-Async] [-WaitTaskId <id>]
  -UploadModHtml <file.html> -ServerUuid <uuid> [-ModHtmlMode download|enable|download_and_enable]
  -UploadMissionPbo <file.pbo> -ServerUuid <uuid>
  -ServerUuid / -ServerName (optional if only one server)
Env: A3ST_AGENT_URL, A3ST_AGENT_TOKEN
Tip: run -Command actions first to list all supported APIs.
"@
        exit 2
    }
}

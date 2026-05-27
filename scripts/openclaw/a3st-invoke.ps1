# Invoke Arma3 Server Tools Agent API (for OpenClaw exec / automation).
param(
    [string]$BaseUrl = $env:A3ST_AGENT_URL,
    [string]$Token = $env:A3ST_AGENT_TOKEN,
    [ValidateSet(
        "health", "list", "status", "task", "actions", "logs", "rpt",
        "steamcmd-stop", "steamcmd-status", "get-config", "put-config",
        "upload-mod-html", "")]
    [string]$Command = "",
    [string]$LogKind = "rpt",
    [int]$LogTail = 200,
    [string]$LogFile = "",
    [string]$ServerUuid = "",
    [string]$ServerName = "",
    [string]$TaskFile = "",
    [string]$TaskJson = "",
    [string]$ConfigFile = "",
    [switch]$Async,
    [switch]$ShowSteamCmdProgress,
    [switch]$SteamCmdWindow,
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

function Invoke-A3stPut {
    param([string]$Path, [string]$Body)
    $uri = "$BaseUrl$Path"
    return Invoke-RestMethod -Uri $uri -Method Put -Headers (Get-AuthHeaders) -Body $Body
}

function Resolve-A3stServerUuid {
    if (-not [string]::IsNullOrWhiteSpace($ServerUuid)) {
        return $ServerUuid
    }
    $list = Invoke-A3stGet -Path "/api/v1/servers"
    if ($list.Count -eq 1) {
        return $list[0].serverUuid
    }
    if (-not [string]::IsNullOrWhiteSpace($ServerName)) {
        foreach ($item in $list) {
            if ($item.configName -eq $ServerName) {
                return $item.serverUuid
            }
        }
    }
    return ""
}

function Test-A3stEnvelopeOk {
    param($Envelope)
    if ($null -eq $Envelope) {
        return $false
    }
    if ($Envelope.success -eq $false) {
        return $false
    }
    if ($Envelope.data -and $Envelope.data.success -eq $false) {
        return $false
    }
    return $true
}

function Write-A3stSteamCmdLogTail {
    param([int]$TailLines = 25)
    try {
        $log = Invoke-A3stGet -Path "/api/v1/steamcmd/log?source=session&tail=$TailLines"
        if ($log.data -and $log.data.text) {
            Write-Host "--- steamcmd (session) ---"
            Write-Host $log.data.text
        }
    }
    catch {
        # Agent 忙碌或未开始时可忽略
    }
}

function Invoke-A3stTaskPostWithOptionalProgress {
    param(
        [string]$Body,
        [bool]$PollLog
    )
    if (-not $PollLog) {
        return Invoke-A3stPost -Path "/api/v1/task" -Body $Body
    }
    $job = Start-Job -ScriptBlock {
        param($BaseUrl, $Token, $Body)
        $headers = @{ "Content-Type" = "application/json" }
        if (-not [string]::IsNullOrWhiteSpace($Token)) {
            $headers["Authorization"] = "Bearer $Token"
        }
        Invoke-RestMethod -Uri "$BaseUrl/api/v1/task" -Method Post -Headers $headers -Body $Body
    } -ArgumentList $BaseUrl, $Token, $Body
    try {
        while ($job.State -eq "Running") {
            Write-A3stSteamCmdLogTail -TailLines 30
            Start-Sleep -Seconds 3
        }
        return Receive-Job -Job $job
    }
    finally {
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    }
}

function Apply-A3stSteamCmdTaskOptions {
    param([string]$TaskJson)
    $doc = $TaskJson | ConvertFrom-Json
    if ($SteamCmdWindow) {
        $doc | Add-Member -NotePropertyName captureSteamCmdOutput -NotePropertyValue $false -Force
    }
    if ($Async) {
        $doc | Add-Member -NotePropertyName async -NotePropertyValue $true -Force
    }
    return ($doc | ConvertTo-Json -Depth 10 -Compress)
}

function Show-A3stUsage {
    Write-Host @"
Arma3 Server Tools Agent invoke

模组 HTML（推荐，勿把大段 HTML 塞进 -TaskJson）:
  -UploadModHtml <mods.html> -ServerUuid <uuid> [-ModHtmlMode download_and_enable]
  -Command upload-mod-html  (同上，需 -UploadModHtml)

常用:
  -Command actions|health|list|status|get-config|put-config|task|logs|rpt|steamcmd-status|steamcmd-stop
  -Command stop|start|restart|write_cfg|update_server|help  (快捷 task)

任务:
  -TaskFile <task.json>  OR  -TaskJson '<json>'  [-Async] [-WaitTaskId <id>]
  -ShowSteamCmdProgress   执行下载时在本地 PS 轮询 steamcmd 日志（B 机调 A 时有用）
  -SteamCmdWindow         任务使用弹出 SteamCMD 黑窗（A 机桌面，需 Steam Guard 时用）

配置:
  -Command get-config -ServerUuid <uuid>
  -Command put-config -ServerUuid <uuid> -ConfigFile <server.json>

环境变量: A3ST_AGENT_URL, A3ST_AGENT_TOKEN
"@
}

if ($Command -eq "upload-mod-html" -and [string]::IsNullOrWhiteSpace($UploadModHtml)) {
    Write-Error "upload-mod-html requires -UploadModHtml <path>."
}

if (-not [string]::IsNullOrWhiteSpace($WaitTaskId)) {
    if ($ShowSteamCmdProgress) {
        while ($true) {
            $poll = Invoke-A3stGet -Path "/api/v1/tasks/$WaitTaskId"
            Write-A3stSteamCmdLogTail -TailLines 30
            if ($poll.data.status -eq "Succeeded") {
                $poll | ConvertTo-Json -Depth 8
                exit 0
            }
            if ($poll.data.status -eq "Failed") {
                $poll | ConvertTo-Json -Depth 8
                exit 1
            }
            Start-Sleep -Seconds 3
        }
    }
    $pollDone = Invoke-A3stGet -Path "/api/v1/tasks/$WaitTaskId"
    $pollDone | ConvertTo-Json -Depth 8
    if ($pollDone.success -and $pollDone.data.status -eq "Succeeded") { exit 0 }
    if ($pollDone.success -and $pollDone.data.status -eq "Failed") { exit 1 }
    exit 2
}

if (-not [string]::IsNullOrWhiteSpace($UploadModHtml)) {
    if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
        $ServerUuid = Resolve-A3stServerUuid
    }
    if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
        Write-Error "UploadModHtml requires -ServerUuid (or single-server / -ServerName)."
    }
    $uri = "$BaseUrl/api/v1/servers/$ServerUuid/files/mod-list-html?mode=$ModHtmlMode"
    $headers = @{}
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $headers["Authorization"] = "Bearer $Token"
    }
    $form = @{ file = Get-Item -LiteralPath $UploadModHtml }
    $result = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Form $form
    $result | ConvertTo-Json -Depth 8
    if (-not (Test-A3stEnvelopeOk $result)) { exit 1 }
    exit 0
}

if (-not [string]::IsNullOrWhiteSpace($UploadMissionPbo)) {
    if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
        $ServerUuid = Resolve-A3stServerUuid
    }
    if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
        Write-Error "UploadMissionPbo requires -ServerUuid."
    }
    $uri = "$BaseUrl/api/v1/servers/$ServerUuid/files/mission-pbo?addToMissionList=true"
    $headers = @{}
    if (-not [string]::IsNullOrWhiteSpace($Token)) {
        $headers["Authorization"] = "Bearer $Token"
    }
    $form = @{ file = Get-Item -LiteralPath $UploadMissionPbo }
    $result = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Form $form
    $result | ConvertTo-Json -Depth 8
    if (-not (Test-A3stEnvelopeOk $result)) { exit 1 }
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

if ($Command -eq "" -and [string]::IsNullOrWhiteSpace($UploadModHtml) -and [string]::IsNullOrWhiteSpace($UploadMissionPbo)) {
    Show-A3stUsage
    exit 2
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
    "steamcmd-stop" {
        Invoke-A3stPost -Path "/api/v1/steamcmd/stop" -Body "{}" | ConvertTo-Json -Depth 8
        exit 0
    }
    "steamcmd-status" {
        Invoke-A3stGet -Path "/api/v1/steamcmd/status" | ConvertTo-Json -Depth 8
        exit 0
    }
    "list" {
        Invoke-A3stGet -Path "/api/v1/servers" | ConvertTo-Json -Depth 6
        exit 0
    }
    "get-config" {
        $ServerUuid = Resolve-A3stServerUuid
        if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
            Write-Error "get-config requires -ServerUuid or -ServerName, or single-server setup."
        }
        Invoke-A3stGet -Path "/api/v1/servers/$ServerUuid/config" | ConvertTo-Json -Depth 10
        exit 0
    }
    "put-config" {
        $ServerUuid = Resolve-A3stServerUuid
        if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
            Write-Error "put-config requires -ServerUuid or -ServerName."
        }
        if ([string]::IsNullOrWhiteSpace($ConfigFile)) {
            Write-Error "put-config requires -ConfigFile <path.json>."
        }
        if (-not (Test-Path -LiteralPath $ConfigFile)) {
            Write-Error "Config file not found: $ConfigFile"
        }
        $body = Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8
        $result = Invoke-A3stPut -Path "/api/v1/servers/$ServerUuid/config" -Body $body
        $result | ConvertTo-Json -Depth 8
        if (-not (Test-A3stEnvelopeOk $result)) { exit 1 }
        exit 0
    }
    "upload-mod-html" {
        if ([string]::IsNullOrWhiteSpace($UploadModHtml)) {
            Write-Error "upload-mod-html requires -UploadModHtml <path>."
        }
        if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
            $ServerUuid = Resolve-A3stServerUuid
        }
        if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
            Write-Error "upload-mod-html requires -ServerUuid."
        }
        $uri = "$BaseUrl/api/v1/servers/$ServerUuid/files/mod-list-html?mode=$ModHtmlMode"
        $headers = @{}
        if (-not [string]::IsNullOrWhiteSpace($Token)) {
            $headers["Authorization"] = "Bearer $Token"
        }
        $form = @{ file = Get-Item -LiteralPath $UploadModHtml }
        $result = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Form $form
        $result | ConvertTo-Json -Depth 8
        if (-not (Test-A3stEnvelopeOk $result)) { exit 1 }
        exit 0
    }
    "logs" {
        if ([string]::IsNullOrWhiteSpace($ServerUuid)) {
            $ServerUuid = Resolve-A3stServerUuid
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
            $ServerUuid = Resolve-A3stServerUuid
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
        $ServerUuid = Resolve-A3stServerUuid
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
        $TaskJson = Apply-A3stSteamCmdTaskOptions -TaskJson $TaskJson
        $pollLog = $ShowSteamCmdProgress -and -not $Async
        $result = Invoke-A3stTaskPostWithOptionalProgress -Body $TaskJson -PollLog $pollLog
        $result | ConvertTo-Json -Depth 8
        if (-not (Test-A3stEnvelopeOk $result)) {
            exit 1
        }
        if ($result.data -and $result.data.taskId) {
            $hint = "-WaitTaskId $($result.data.taskId)"
            if ($ShowSteamCmdProgress) {
                $hint = $hint + " -ShowSteamCmdProgress"
            }
            Write-Host "Poll: $hint"
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
            if (-not (Test-A3stEnvelopeOk $result)) {
                exit 1
            }
            exit 0
        }
        Show-A3stUsage
        exit 2
    }
}

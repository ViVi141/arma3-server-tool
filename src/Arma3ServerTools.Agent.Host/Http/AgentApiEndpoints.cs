using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Arma3ServerTools.Agent.Host.Configuration;
using Arma3ServerTools.Application.Automation;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Newtonsoft.Json;

namespace Arma3ServerTools.Agent.Host.Http
{
    public static class AgentApiEndpoints
    {
        public static void MapAgentApi(this IEndpointRouteBuilder endpoints)
        {
            endpoints.MapGet("/api/v1/health", HandleHealth);
            endpoints.MapGet("/api/v1/actions", HandleActions);
            endpoints.MapGet("/api/v1/openapi.json", HandleOpenApiStub);
            endpoints.MapGet("/api/v1/servers", HandleListServers);
            endpoints.MapGet("/api/v1/servers/{uuid}/status", HandleServerStatus);
            endpoints.MapGet("/api/v1/servers/{uuid}/config", HandleGetConfig);
            endpoints.MapPut("/api/v1/servers/{uuid}/config", HandlePutConfig);
            endpoints.MapPost("/api/v1/servers", HandleCreateServer);
            endpoints.MapPost("/api/v1/servers/{uuid}/clone", HandleCloneServer);
            endpoints.MapDelete("/api/v1/servers/{uuid}", HandleDeleteServer);
            endpoints.MapPut("/api/v1/servers/{uuid}/rename", HandleRenameServer);
            endpoints.MapGet("/api/v1/settings/steamcmd", HandleGetSteamCmd);
            endpoints.MapPut("/api/v1/settings/steamcmd", HandlePutSteamCmd);
            endpoints.MapGet("/api/v1/steamcmd/log", HandleSteamCmdLog);
            endpoints.MapGet("/api/v1/servers/{uuid}/preflight", HandlePreflight);
            endpoints.MapGet("/api/v1/servers/{uuid}/rpt", HandleRpt);
            endpoints.MapGet("/api/v1/servers/{uuid}/logs", HandleListGameLogs);
            endpoints.MapGet("/api/v1/servers/{uuid}/logs/read", HandleReadGameLog);
            endpoints.MapGet("/api/v1/servers/{uuid}/monitoring/summary", HandleMonitoringSummary);
            endpoints.MapPost("/api/v1/servers/{uuid}/files/mod-list-html", HandleModListHtml);
            endpoints.MapPost("/api/v1/servers/{uuid}/files/mission-pbo", HandleMissionPbo);
            endpoints.MapPost("/api/v1/task", HandleTask);
            endpoints.MapGet("/api/v1/tasks/{taskId}", HandleGetTask);
        }

        private static AgentSettings GetSettings(HttpContext context)
        {
            return context.RequestServices.GetRequiredService<AgentSettings>();
        }

        private static Task HandleHealth(HttpContext context)
        {
            AgentSettings settings = GetSettings(context);
            var payload = new
            {
                success = true,
                service = "Arma3ServerTools.Agent",
                channels = "external (OpenClaw / scripts)",
                remoteAccessEnabled = settings.Http.RemoteAccessEnabled,
                publicBaseUrl = AgentHttpEndpointResolver.ResolvePublicBaseUrl(settings.Http),
            };
            return WriteLegacyJson(context, StatusCodes.Status200OK, payload);
        }

        private static Task HandleActions(HttpContext context)
        {
            AgentApiEnvelope<AgentApiCatalogData> envelope = AgentApiResponseWriter.Ok(
                context,
                AgentApiCatalog.Build());
            return AgentApiResponseWriter.WriteEnvelopeAsync(context, StatusCodes.Status200OK, envelope);
        }

        private static Task HandleOpenApiStub(HttpContext context)
        {
            var data = new
            {
                openapi = "3.0.0",
                info = new { title = "Arma3 Server Tools Agent", version = "1.5" },
                note = "See GET /api/v1/actions for machine-readable capability list.",
            };
            return AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(context, data));
        }

        private static Task HandleListServers(HttpContext context)
        {
            IServerAutomationService automation = context.RequestServices.GetRequiredService<IServerAutomationService>();
            return WriteLegacyJson(context, StatusCodes.Status200OK, automation.ListServers());
        }

        private static Task HandleServerStatus(HttpContext context, string uuid)
        {
            IServerAutomationService automation = context.RequestServices.GetRequiredService<IServerAutomationService>();
            ServerAutomationStatus status = automation.GetStatus(uuid);
            if (status == null)
            {
                return WriteLegacyJson(
                    context,
                    StatusCodes.Status404NotFound,
                    new { success = false, message = "Not found" });
            }

            return WriteLegacyJson(context, StatusCodes.Status200OK, status);
        }

        private static async Task HandleGetConfig(HttpContext context, string uuid)
        {
            IAgentServerAdminService admin = context.RequestServices.GetRequiredService<IAgentServerAdminService>();
            ArmaServerConfig config = admin.GetConfig(uuid);
            if (config == null)
            {
                await WriteFailEnvelope(context, StatusCodes.Status404NotFound, "NOT_FOUND", "未找到服务器。")
                    .ConfigureAwait(false);
                return;
            }

            await AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(context, config)).ConfigureAwait(false);
        }

        private static async Task HandlePutConfig(HttpContext context, string uuid)
        {
            IAgentServerAdminService admin = context.RequestServices.GetRequiredService<IAgentServerAdminService>();
            string body = await ReadBodyAsync(context).ConfigureAwait(false);
            ArmaServerConfig config = JsonConvert.DeserializeObject<ArmaServerConfig>(body);
            if (config == null)
            {
                await WriteFailEnvelope(context, StatusCodes.Status400BadRequest, "INVALID_JSON", "无法解析配置 JSON。")
                    .ConfigureAwait(false);
                return;
            }

            OperationResult result = admin.PutConfig(uuid, config);
            if (!result.Success)
            {
                await WriteFailEnvelope(context, StatusCodes.Status400BadRequest, "PUT_CONFIG_FAILED", result.Message)
                    .ConfigureAwait(false);
                return;
            }

            await AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(context, new { message = result.Message })).ConfigureAwait(false);
        }

        private static async Task HandleCreateServer(HttpContext context)
        {
            IAgentServerAdminService admin = context.RequestServices.GetRequiredService<IAgentServerAdminService>();
            string body = await ReadBodyAsync(context).ConfigureAwait(false);
            CreateServerRequest request = JsonConvert.DeserializeObject<CreateServerRequest>(body);
            if (request == null || string.IsNullOrWhiteSpace(request.Name))
            {
                await WriteFailEnvelope(context, StatusCodes.Status400BadRequest, "INVALID_REQUEST", "name 必填。")
                    .ConfigureAwait(false);
                return;
            }

            OperationResult result = admin.CreateServer(request.Name, request.ServerDir);
            await WriteOperationEnvelope(context, result, "CREATE_FAILED").ConfigureAwait(false);
        }

        private static async Task HandleCloneServer(HttpContext context, string uuid)
        {
            IAgentServerAdminService admin = context.RequestServices.GetRequiredService<IAgentServerAdminService>();
            string body = await ReadBodyAsync(context).ConfigureAwait(false);
            CloneServerRequest request = JsonConvert.DeserializeObject<CloneServerRequest>(body);
            OperationResult result = admin.CloneServer(uuid, request.NewName, request.NewServerDir);
            await WriteOperationEnvelope(context, result, "CLONE_FAILED").ConfigureAwait(false);
        }

        private static async Task HandleDeleteServer(HttpContext context, string uuid)
        {
            IAgentServerAdminService admin = context.RequestServices.GetRequiredService<IAgentServerAdminService>();
            OperationResult result = admin.DeleteServer(uuid);
            await WriteOperationEnvelope(context, result, "DELETE_FAILED").ConfigureAwait(false);
        }

        private static async Task HandleRenameServer(HttpContext context, string uuid)
        {
            IAgentServerAdminService admin = context.RequestServices.GetRequiredService<IAgentServerAdminService>();
            string body = await ReadBodyAsync(context).ConfigureAwait(false);
            RenameServerRequest request = JsonConvert.DeserializeObject<RenameServerRequest>(body);
            OperationResult result = admin.RenameServer(uuid, request.NewName);
            await WriteOperationEnvelope(context, result, "RENAME_FAILED").ConfigureAwait(false);
        }

        private static async Task HandleGetSteamCmd(HttpContext context)
        {
            AgentSteamSettingsService steamSettings =
                context.RequestServices.GetRequiredService<AgentSteamSettingsService>();
            await AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(context, steamSettings.GetRedacted())).ConfigureAwait(false);
        }

        private static async Task HandlePutSteamCmd(HttpContext context)
        {
            AgentSteamSettingsService steamSettings =
                context.RequestServices.GetRequiredService<AgentSteamSettingsService>();
            string body = await ReadBodyAsync(context).ConfigureAwait(false);
            SteamcmdEntity entity = JsonConvert.DeserializeObject<SteamcmdEntity>(body);
            if (entity == null)
            {
                await WriteFailEnvelope(context, StatusCodes.Status400BadRequest, "INVALID_JSON", "无法解析 Steam 设置。")
                    .ConfigureAwait(false);
                return;
            }

            steamSettings.Save(entity);
            await AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(context, steamSettings.GetRedacted())).ConfigureAwait(false);
        }

        private static Task HandleSteamCmdLog(HttpContext context)
        {
            SteamCmdLogService logService = context.RequestServices.GetRequiredService<SteamCmdLogService>();
            int maxLines = 300;
            if (context.Request.Query.TryGetValue("tail", out Microsoft.Extensions.Primitives.StringValues tailValue)
                && int.TryParse(tailValue.ToString(), out int parsed)
                && parsed > 0)
            {
                maxLines = parsed;
            }

            string source = "aggregated";
            if (context.Request.Query.TryGetValue("source", out Microsoft.Extensions.Primitives.StringValues sourceValue))
            {
                source = sourceValue.ToString().Trim().ToLowerInvariant();
            }

            string text;
            string latestSessionFile = logService.GetLatestSessionLogFilePath();
            string installDirectory = logService.ResolveSteamCmdInstallDirectory();
            if (source == "session")
            {
                text = logService.ReadLatestSessionLog(maxLines);
            }
            else if (source == "install")
            {
                text = logService.ReadSteamCmdInstallLogs(maxLines);
            }
            else
            {
                text = logService.ReadAggregatedLog(maxLines);
            }

            var data = new
            {
                source,
                text,
                latestSessionLogFile = latestSessionFile,
                steamCmdInstallDirectory = installDirectory,
            };
            return AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(context, data));
        }

        private static async Task HandlePreflight(HttpContext context, string uuid)
        {
            IServerAutomationService automation = context.RequestServices.GetRequiredService<IServerAutomationService>();
            ServerPreflightChecker preflight = context.RequestServices.GetRequiredService<ServerPreflightChecker>();
            IServerProcessService processService = context.RequestServices.GetRequiredService<IServerProcessService>();
            ArmaServerConfig config = automation.ResolveServer(uuid, null);
            if (config == null)
            {
                await WriteFailEnvelope(context, StatusCodes.Status404NotFound, "NOT_FOUND", "未找到服务器。")
                    .ConfigureAwait(false);
                return;
            }

            ServerRunState state = processService.GetState(config);
            IReadOnlyList<PreflightCheckItem> items = preflight.Check(config, state);
            await AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(
                    context,
                    new
                    {
                        hasBlockingErrors = preflight.HasBlockingErrors(items),
                        items,
                    })).ConfigureAwait(false);
        }

        private static Task HandleRpt(HttpContext context, string uuid)
        {
            return HandleReadGameLog(context, uuid, GameLogKinds.Rpt);
        }

        private static async Task HandleListGameLogs(HttpContext context, string uuid)
        {
            IServerAutomationService automation = context.RequestServices.GetRequiredService<IServerAutomationService>();
            RptLogService rptLogService = context.RequestServices.GetRequiredService<RptLogService>();
            ArmaServerConfig config = automation.ResolveServer(uuid, null);
            if (config == null)
            {
                await WriteFailEnvelope(context, StatusCodes.Status404NotFound, "NOT_FOUND", "未找到服务器。")
                    .ConfigureAwait(false);
                return;
            }

            string kind = GameLogKinds.All;
            if (context.Request.Query.TryGetValue("kind", out Microsoft.Extensions.Primitives.StringValues kindValue))
            {
                kind = kindValue.ToString();
            }

            IReadOnlyList<GameLogFileEntry> files = rptLogService.ListLogFiles(config, kind);
            await AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(
                    context,
                    new
                    {
                        kind,
                        serverDir = config.ServerDir,
                        files,
                    })).ConfigureAwait(false);
        }

        private static async Task HandleReadGameLog(HttpContext context, string uuid, string defaultKind)
        {
            IServerAutomationService automation = context.RequestServices.GetRequiredService<IServerAutomationService>();
            RptLogService rptLogService = context.RequestServices.GetRequiredService<RptLogService>();
            ArmaServerConfig config = automation.ResolveServer(uuid, null);
            if (config == null)
            {
                await WriteFailEnvelope(context, StatusCodes.Status404NotFound, "NOT_FOUND", "未找到服务器。")
                    .ConfigureAwait(false);
                return;
            }

            int tail = 200;
            if (context.Request.Query.TryGetValue("tail", out Microsoft.Extensions.Primitives.StringValues tailValue)
                && int.TryParse(tailValue.ToString(), out int parsedTail))
            {
                tail = parsedTail;
            }

            string kind = defaultKind;
            if (context.Request.Query.TryGetValue("kind", out Microsoft.Extensions.Primitives.StringValues kindValue))
            {
                kind = kindValue.ToString();
            }

            string fileName = null;
            if (context.Request.Query.TryGetValue("file", out Microsoft.Extensions.Primitives.StringValues fileValue))
            {
                fileName = fileValue.ToString();
            }

            GameLogReadResult logResult = rptLogService.ReadGameLog(config, kind, tail, fileName);
            await AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(
                    context,
                    new
                    {
                        found = logResult.Found,
                        kind = logResult.Kind,
                        path = logResult.Path,
                        tail,
                        content = logResult.Content,
                        availableFiles = logResult.AvailableFiles,
                    })).ConfigureAwait(false);
        }

        private static async Task HandleMonitoringSummary(HttpContext context, string uuid)
        {
            MonitoringQueryService monitoring = context.RequestServices.GetRequiredService<MonitoringQueryService>();
            int limit = 50;
            var data = new
            {
                playerStats = monitoring.GetPlayerStats(uuid, limit),
                objectStats = monitoring.GetRecentObjectStats(uuid, limit),
            };
            await AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(context, data)).ConfigureAwait(false);
        }

        private static async Task HandleModListHtml(HttpContext context, string uuid)
        {
            ModListHtmlImportService importService =
                context.RequestServices.GetRequiredService<ModListHtmlImportService>();
            AgentSettings settings = GetSettings(context);
            string html = await ReadModListHtmlAsync(context, settings).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(html))
            {
                await WriteFailEnvelope(context, StatusCodes.Status400BadRequest, "EMPTY_BODY", "未收到 HTML 内容。")
                    .ConfigureAwait(false);
                return;
            }

            string mode = context.Request.Query["mode"];
            (OperationResult result, ModListHtmlImportResult data) = importService.Import(uuid, html, mode);
            if (!result.Success)
            {
                await WriteFailEnvelope(context, StatusCodes.Status400BadRequest, "IMPORT_FAILED", result.Message)
                    .ConfigureAwait(false);
                return;
            }

            await AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(context, new { message = result.Message, import = data })).ConfigureAwait(false);
        }

        private static async Task HandleMissionPbo(HttpContext context, string uuid)
        {
            MissionFileDeployService deployService =
                context.RequestServices.GetRequiredService<MissionFileDeployService>();
            AgentSettings settings = GetSettings(context);
            if (!context.Request.HasFormContentType)
            {
                await WriteFailEnvelope(
                    context,
                    StatusCodes.Status400BadRequest,
                    "INVALID_CONTENT",
                    "请使用 multipart/form-data 上传 file 字段。").ConfigureAwait(false);
                return;
            }

            IFormFile file = context.Request.Form.Files.GetFile("file");
            if (file == null || file.Length == 0)
            {
                await WriteFailEnvelope(context, StatusCodes.Status400BadRequest, "MISSING_FILE", "file 字段为空。")
                    .ConfigureAwait(false);
                return;
            }

            if (file.Length > settings.FileUpload.MaxPboBytes)
            {
                await WriteFailEnvelope(context, StatusCodes.Status400BadRequest, "FILE_TOO_LARGE", "PBO 超过大小限制。")
                    .ConfigureAwait(false);
                return;
            }

            bool addToList = string.Equals(
                context.Request.Query["addToMissionList"],
                "true",
                StringComparison.OrdinalIgnoreCase);
            int difficulty = 3;
            if (context.Request.Query.TryGetValue("missionDifficulty", out Microsoft.Extensions.Primitives.StringValues diffValue)
                && int.TryParse(diffValue.ToString(), out int parsedDiff))
            {
                difficulty = parsedDiff;
            }

            using (Stream stream = file.OpenReadStream())
            {
                (OperationResult result, MissionFileDeployResult data) = deployService.DeployPbo(
                    uuid,
                    file.FileName,
                    stream,
                    addToList,
                    difficulty);
                if (!result.Success)
                {
                    await WriteFailEnvelope(context, StatusCodes.Status400BadRequest, "DEPLOY_FAILED", result.Message)
                        .ConfigureAwait(false);
                    return;
                }

                await AgentApiResponseWriter.WriteEnvelopeAsync(
                    context,
                    StatusCodes.Status200OK,
                    AgentApiResponseWriter.Ok(context, new { message = result.Message, deploy = data })).ConfigureAwait(false);
            }
        }

        private static async Task HandleTask(HttpContext context)
        {
            IServerAutomationService automation = context.RequestServices.GetRequiredService<IServerAutomationService>();
            string body = await ReadBodyAsync(context).ConfigureAwait(false);
            AutomationTaskDocument task = AutomationTaskParser.ParseJson(body);
            if (task.Async)
            {
                string taskId = automation.EnqueueTask(task);
                await AgentApiResponseWriter.WriteEnvelopeAsync(
                    context,
                    StatusCodes.Status202Accepted,
                    AgentApiResponseWriter.Ok(
                        context,
                        new { taskId = taskId, status = "accepted" })).ConfigureAwait(false);
                return;
            }

            AutomationRunResult result = await automation.ExecuteTaskAsync(task, context.RequestAborted).ConfigureAwait(false);
            int code = result.Success ? StatusCodes.Status200OK : StatusCodes.Status400BadRequest;
            await WriteLegacyJson(context, code, result).ConfigureAwait(false);
        }

        private static async Task HandleGetTask(HttpContext context, string taskId)
        {
            IServerAutomationService automation = context.RequestServices.GetRequiredService<IServerAutomationService>();
            AutomationTaskRunState state = automation.GetTaskRun(taskId);
            if (state == null)
            {
                await WriteFailEnvelope(context, StatusCodes.Status404NotFound, "NOT_FOUND", "未找到任务。")
                    .ConfigureAwait(false);
                return;
            }

            var data = new
            {
                taskId = state.TaskId,
                status = state.Status.ToString(),
                steps = state.Result != null ? state.Result.Steps : null,
                message = state.Result != null ? state.Result.Message : null,
                success = state.Result != null && state.Result.Success,
                serverUuid = state.Result != null ? state.Result.ServerUuid : null,
            };
            await AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                StatusCodes.Status200OK,
                AgentApiResponseWriter.Ok(context, data)).ConfigureAwait(false);
        }

        private static async Task<string> ReadModListHtmlAsync(HttpContext context, AgentSettings settings)
        {
            if (context.Request.HasFormContentType)
            {
                IFormFile file = context.Request.Form.Files.GetFile("file");
                if (file != null && file.Length > 0)
                {
                    if (file.Length > settings.FileUpload.MaxHtmlBytes)
                    {
                        return string.Empty;
                    }

                    using (var reader = new StreamReader(file.OpenReadStream(), Encoding.UTF8))
                    {
                        return await reader.ReadToEndAsync().ConfigureAwait(false);
                    }
                }
            }

            string body = await ReadBodyAsync(context).ConfigureAwait(false);
            if (body.Length > settings.FileUpload.MaxHtmlBytes)
            {
                return string.Empty;
            }

            return body;
        }

        private static async Task<string> ReadBodyAsync(HttpContext context)
        {
            using (var reader = new StreamReader(context.Request.Body, Encoding.UTF8, false, 1024, true))
            {
                return await reader.ReadToEndAsync().ConfigureAwait(false);
            }
        }

        private static Task WriteLegacyJson(HttpContext context, int statusCode, object payload)
        {
            context.Response.StatusCode = statusCode;
            context.Response.ContentType = "application/json; charset=utf-8";
            string json = JsonConvert.SerializeObject(payload);
            return context.Response.WriteAsync(json);
        }

        private static Task WriteFailEnvelope(HttpContext context, int statusCode, string code, string message)
        {
            return AgentApiResponseWriter.WriteEnvelopeAsync(
                context,
                statusCode,
                AgentApiResponseWriter.Fail<object>(context, code, message));
        }

        private static Task WriteOperationEnvelope(HttpContext context, OperationResult result, string errorCode)
        {
            int code = result.Success ? StatusCodes.Status200OK : StatusCodes.Status400BadRequest;
            if (result.Success)
            {
                return AgentApiResponseWriter.WriteEnvelopeAsync(
                    context,
                    code,
                    AgentApiResponseWriter.Ok(context, new { message = result.Message }));
            }

            return WriteFailEnvelope(context, code, errorCode, result.Message);
        }

        private sealed class CreateServerRequest
        {
            public string Name { get; set; }

            public string ServerDir { get; set; }
        }

        private sealed class CloneServerRequest
        {
            public string NewName { get; set; }

            public string NewServerDir { get; set; }
        }

        private sealed class RenameServerRequest
        {
            public string NewName { get; set; }
        }
    }
}

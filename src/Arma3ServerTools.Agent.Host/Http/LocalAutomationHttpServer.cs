using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Agent.Host.Configuration;
using Arma3ServerTools.Application.Automation;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace Arma3ServerTools.Agent.Host.Http
{
    /// <summary>
    /// Local HTTP API for OpenClaw / scripts / MCP. Does not implement IM channels.
    /// </summary>
    public sealed class LocalAutomationHttpServer : IDisposable
    {
        private readonly AgentSettings settings;
        private readonly IServerAutomationService automationService;
        private readonly ILogger logger;
        private HttpListener listener;
        private CancellationTokenSource cancellation;
        private Task listenTask;

        public LocalAutomationHttpServer(
            AgentSettings settings,
            IServerAutomationService automationService,
            ILogger logger)
        {
            this.settings = settings;
            this.automationService = automationService;
            this.logger = logger;
        }

        public void Start()
        {
            if (!settings.Http.Enabled)
            {
                return;
            }

            IList<string> prefixes = AgentHttpEndpointResolver.ResolveListenPrefixes(settings.Http);
            listener = new HttpListener();
            for (int i = 0; i < prefixes.Count; i++)
            {
                listener.Prefixes.Add(prefixes[i]);
            }

            listener.Start();
            cancellation = new CancellationTokenSource();
            listenTask = Task.Run(() => ListenLoop(cancellation.Token));
            logger.LogInformation(
                "Agent HTTP listening on {Prefixes}, remote={Remote}, publicUrl={PublicUrl}",
                string.Join(", ", prefixes),
                settings.Http.RemoteAccessEnabled,
                AgentHttpEndpointResolver.ResolvePublicBaseUrl(settings.Http));
        }

        public void Dispose()
        {
            if (cancellation != null)
            {
                cancellation.Cancel();
            }

            if (listener != null && listener.IsListening)
            {
                listener.Stop();
                listener.Close();
            }

            if (listenTask != null)
            {
                try
                {
                    listenTask.Wait(TimeSpan.FromSeconds(3));
                }
                catch (AggregateException)
                {
                }
            }

            cancellation?.Dispose();
        }

        private async Task ListenLoop(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested && listener != null && listener.IsListening)
            {
                HttpListenerContext context = null;
                try
                {
                    context = await listener.GetContextAsync().ConfigureAwait(false);
                    await HandleContextAsync(context).ConfigureAwait(false);
                }
                catch (HttpListenerException ex) when (cancellationToken.IsCancellationRequested)
                {
                    logger.LogDebug(ex, "HTTP listener stopped.");
                    break;
                }
                catch (ObjectDisposedException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "HTTP request handling failed.");
                    if (context != null && context.Response != null)
                    {
                        WriteJson(
                            context.Response,
                            HttpStatusCode.InternalServerError,
                            new { success = false, message = ex.Message });
                    }
                }
            }
        }

        private async Task HandleContextAsync(HttpListenerContext context)
        {
            IPAddress remoteAddress = context.Request.RemoteEndPoint != null
                ? context.Request.RemoteEndPoint.Address
                : null;
            if (!AgentCallerAllowlist.IsCallerAllowed(settings.Http, remoteAddress))
            {
                logger.LogWarning(
                    "Rejected request from {RemoteAddress}",
                    remoteAddress != null ? remoteAddress.ToString() : "unknown");
                WriteJson(
                    context.Response,
                    HttpStatusCode.Forbidden,
                    new { success = false, message = "Caller IP not allowed." });
                return;
            }

            string path = context.Request.Url.AbsolutePath.TrimEnd('/');
            string method = context.Request.HttpMethod.ToUpperInvariant();

            if (path == "/api/v1/health" && method == "GET")
            {
                WriteJson(
                    context.Response,
                    HttpStatusCode.OK,
                    new
                    {
                        success = true,
                        service = "Arma3ServerTools.Agent",
                        channels = "external (OpenClaw / scripts)",
                        remoteAccessEnabled = settings.Http.RemoteAccessEnabled,
                        publicBaseUrl = AgentHttpEndpointResolver.ResolvePublicBaseUrl(settings.Http),
                    });
                return;
            }

            if (!IsAuthorized(context.Request))
            {
                WriteJson(
                    context.Response,
                    HttpStatusCode.Unauthorized,
                    new { success = false, message = "Unauthorized" });
                return;
            }

            if (path == "/api/v1/servers" && method == "GET")
            {
                WriteJson(context.Response, HttpStatusCode.OK, automationService.ListServers());
                return;
            }

            if (path.StartsWith("/api/v1/servers/", StringComparison.OrdinalIgnoreCase) && method == "GET")
            {
                string uuid = path.Substring("/api/v1/servers/".Length);
                if (uuid.EndsWith("/status", StringComparison.OrdinalIgnoreCase))
                {
                    uuid = uuid.Substring(0, uuid.Length - "/status".Length);
                    WriteJson(context.Response, HttpStatusCode.OK, automationService.GetStatus(uuid));
                    return;
                }
            }

            if (path == "/api/v1/task" && method == "POST")
            {
                string body = ReadBody(context.Request);
                AutomationTaskDocument task = AutomationTaskParser.ParseJson(body);
                AutomationRunResult result = await automationService.ExecuteTaskAsync(task, CancellationToken.None)
                    .ConfigureAwait(false);
                WriteJson(
                    context.Response,
                    result.Success ? HttpStatusCode.OK : HttpStatusCode.BadRequest,
                    result);
                return;
            }

            WriteJson(context.Response, HttpStatusCode.NotFound, new { success = false, message = "Not found" });
        }

        private bool IsAuthorized(HttpListenerRequest request)
        {
            if (string.IsNullOrWhiteSpace(settings.Http.ApiToken))
            {
                return true;
            }

            string header = request.Headers["Authorization"];
            if (!string.IsNullOrEmpty(header) && header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                string token = header.Substring("Bearer ".Length).Trim();
                return string.Equals(token, settings.Http.ApiToken, StringComparison.Ordinal);
            }

            string queryToken = request.QueryString["token"];
            return string.Equals(queryToken, settings.Http.ApiToken, StringComparison.Ordinal);
        }

        private static string ReadBody(HttpListenerRequest request)
        {
            using (var reader = new StreamReader(request.InputStream, request.ContentEncoding ?? Encoding.UTF8))
            {
                return reader.ReadToEnd();
            }
        }

        private static void WriteJson(HttpListenerResponse response, HttpStatusCode statusCode, object payload)
        {
            string json = JsonConvert.SerializeObject(payload);
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            response.StatusCode = (int)statusCode;
            response.ContentType = "application/json; charset=utf-8";
            response.ContentLength64 = bytes.Length;
            response.OutputStream.Write(bytes, 0, bytes.Length);
            response.Close();
        }
    }
}

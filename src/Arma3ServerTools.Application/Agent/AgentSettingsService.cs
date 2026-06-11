using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.Application.Agent
{
    public sealed class AgentSettingsService
    {
        private const string AgentExeName = "Arma3ServerTools.Agent.Host.exe";
        private static readonly HttpClient HttpClient = CreateHttpClient();
        private readonly IAppPaths paths;
        private readonly AgentSettingsRepository repository;

        public AgentSettingsService(IAppPaths paths, AgentSettingsRepository repository)
        {
            this.paths = paths ?? throw new ArgumentNullException(nameof(paths));
            this.repository = repository ?? throw new ArgumentNullException(nameof(repository));
        }

        public AgentSettings LoadOrCreate()
        {
            return repository.LoadOrCreate();
        }

        public void Save(AgentSettings settings)
        {
            repository.Save(settings);
        }

        public string GetSettingsPath()
        {
            return repository.GetSettingsPath();
        }

        public string GetInboxDirectory()
        {
            return repository.GetInboxDirectory();
        }

        public AgentSetupPreset DetectPreset(AgentSettings settings)
        {
            if (settings == null || settings.Http == null)
            {
                return AgentSetupPreset.LocalOnly;
            }

            AgentHttpSettings http = settings.Http;
            if (!string.IsNullOrWhiteSpace(http.ListenPrefix))
            {
                return AgentSetupPreset.Custom;
            }

            if (http.RemoteAccessEnabled)
            {
                return AgentSetupPreset.LanOpenClaw;
            }

            if (string.Equals(http.ListenHost, "127.0.0.1", StringComparison.OrdinalIgnoreCase)
                || string.Equals(http.ListenHost, "localhost", StringComparison.OrdinalIgnoreCase))
            {
                return AgentSetupPreset.LocalOnly;
            }

            return AgentSetupPreset.Custom;
        }

        public void ApplyPreset(AgentSettings settings, AgentSetupPreset preset)
        {
            if (settings == null)
            {
                throw new ArgumentNullException(nameof(settings));
            }

            if (settings.Http == null)
            {
                settings.Http = new AgentHttpSettings();
            }

            AgentHttpSettings http = settings.Http;
            http.Enabled = true;
            http.ListenPrefix = string.Empty;

            if (preset == AgentSetupPreset.LocalOnly)
            {
                http.RemoteAccessEnabled = false;
                http.ListenHost = "127.0.0.1";
                if (http.ListenPort <= 0)
                {
                    http.ListenPort = 19580;
                }

                http.PublicBaseUrl = AgentHttpEndpointResolver.ResolveLocalBaseUrl(http);
                return;
            }

            if (preset == AgentSetupPreset.LanOpenClaw)
            {
                http.RemoteAccessEnabled = true;
                http.ListenHost = "+";
                if (http.ListenPort <= 0)
                {
                    http.ListenPort = 19580;
                }

                string lanIp = TryGetPreferredLanIPv4();
                if (!string.IsNullOrEmpty(lanIp))
                {
                    http.PublicBaseUrl = "http://" + lanIp + ":" + http.ListenPort;
                }
                else
                {
                    http.PublicBaseUrl = string.Empty;
                }

                return;
            }
        }

        public void RegenerateApiToken(AgentSettings settings)
        {
            if (settings == null)
            {
                throw new ArgumentNullException(nameof(settings));
            }

            if (settings.Http == null)
            {
                settings.Http = new AgentHttpSettings();
            }

            settings.Http.ApiToken = Guid.NewGuid().ToString("N");
        }

        public string BuildOpenClawEnvSnippet(AgentSettings settings)
        {
            if (settings == null || settings.Http == null)
            {
                return string.Empty;
            }

            string baseUrl = AgentHttpEndpointResolver.ResolvePublicBaseUrl(settings.Http);
            var builder = new StringBuilder();
            builder.AppendLine("A3ST_AGENT_URL=" + baseUrl);
            builder.AppendLine("A3ST_AGENT_TOKEN=" + (settings.Http.ApiToken ?? string.Empty));
            builder.AppendLine();
            builder.AppendLine("# OpenClaw openclaw.json 片段：");
            builder.AppendLine("\"env\": {");
            builder.AppendLine("  \"A3ST_AGENT_URL\": \"" + baseUrl + "\",");
            builder.AppendLine("  \"A3ST_AGENT_TOKEN\": \"" + (settings.Http.ApiToken ?? string.Empty) + "\"");
            builder.AppendLine("}");
            return builder.ToString().TrimEnd();
        }

        public string ResolveLocalBaseUrl(AgentSettings settings)
        {
            if (settings == null || settings.Http == null)
            {
                return "http://127.0.0.1:19580";
            }

            return AgentHttpEndpointResolver.ResolveLocalBaseUrl(settings.Http);
        }

        public string ResolvePublicBaseUrl(AgentSettings settings)
        {
            if (settings == null || settings.Http == null)
            {
                return "http://127.0.0.1:19580";
            }

            return AgentHttpEndpointResolver.ResolvePublicBaseUrl(settings.Http);
        }

        public bool IsAgentProcessRunning()
        {
            Process[] processes = Process.GetProcessesByName("Arma3ServerTools.Agent.Host");
            return processes != null && processes.Length > 0;
        }

        public string ResolveAgentExecutablePath()
        {
            string fromInstall = Path.Combine(AppContext.BaseDirectory, "agent", AgentExeName);
            if (File.Exists(fromInstall))
            {
                return fromInstall;
            }

            if (!string.IsNullOrEmpty(paths.ApplicationBase))
            {
                string fromApplicationBase = Path.Combine(paths.ApplicationBase, "agent", AgentExeName);
                if (File.Exists(fromApplicationBase))
                {
                    return fromApplicationBase;
                }
            }

            return fromInstall;
        }

        public OperationResult TryStartAgent()
        {
            if (IsAgentProcessRunning())
            {
                return OperationResult.Ok("Agent 已在运行。");
            }

            string exePath = ResolveAgentExecutablePath();
            if (!File.Exists(exePath))
            {
                return OperationResult.Fail("未找到 Agent 程序: " + exePath);
            }

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = exePath,
                    WorkingDirectory = Path.GetDirectoryName(exePath) ?? AppContext.BaseDirectory,
                    UseShellExecute = true,
                };
                Process.Start(startInfo);
                return OperationResult.Ok("已启动 Agent。");
            }
            catch (Exception ex)
            {
                return OperationResult.Fail("启动 Agent 失败: " + ex.Message);
            }
        }

        public async Task<AgentHealthProbeResult> ProbeHealthAsync(
            AgentSettings settings,
            CancellationToken cancellationToken = default)
        {
            if (settings == null || settings.Http == null || !settings.Http.Enabled)
            {
                return AgentHealthProbeResult.Fail("HTTP API 未启用。");
            }

            string baseUrl = ResolveLocalBaseUrl(settings);
            string healthUrl = baseUrl.TrimEnd('/') + "/api/v1/health";
            try
            {
                using (HttpResponseMessage response = await HttpClient
                    .GetAsync(healthUrl, cancellationToken)
                    .ConfigureAwait(false))
                {
                    if (!response.IsSuccessStatusCode)
                    {
                        return AgentHealthProbeResult.Fail("HTTP " + (int)response.StatusCode);
                    }

                    return AgentHealthProbeResult.Ok("Agent 可访问（" + healthUrl + "）");
                }
            }
            catch (Exception ex)
            {
                return AgentHealthProbeResult.Fail(ex.Message);
            }
        }

        public void ParseAllowedCallerIps(string text, AgentSettings settings)
        {
            if (settings == null)
            {
                throw new ArgumentNullException(nameof(settings));
            }

            if (settings.Http == null)
            {
                settings.Http = new AgentHttpSettings();
            }

            settings.Http.AllowedCallerIps.Clear();
            if (string.IsNullOrWhiteSpace(text))
            {
                return;
            }

            string[] parts = text.Split(new[] { ',', ';', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            for (int i = 0; i < parts.Length; i++)
            {
                string part = parts[i].Trim();
                if (!string.IsNullOrEmpty(part))
                {
                    settings.Http.AllowedCallerIps.Add(part);
                }
            }
        }

        public string FormatAllowedCallerIps(AgentSettings settings)
        {
            if (settings == null || settings.Http == null || settings.Http.AllowedCallerIps == null)
            {
                return string.Empty;
            }

            return string.Join(", ", settings.Http.AllowedCallerIps);
        }

        public static string TryGetPreferredLanIPv4()
        {
            try
            {
                foreach (NetworkInterface network in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (network.OperationalStatus != OperationalStatus.Up)
                    {
                        continue;
                    }

                    if (network.NetworkInterfaceType == NetworkInterfaceType.Loopback)
                    {
                        continue;
                    }

                    IPInterfaceProperties properties = network.GetIPProperties();
                    foreach (UnicastIPAddressInformation address in properties.UnicastAddresses)
                    {
                        if (address.Address.AddressFamily != AddressFamily.InterNetwork)
                        {
                            continue;
                        }

                        string text = address.Address.ToString();
                        if (text.StartsWith("169.254.", StringComparison.Ordinal))
                        {
                            continue;
                        }

                        return text;
                    }
                }
            }
            catch
            {
            }

            return string.Empty;
        }

        private static HttpClient CreateHttpClient()
        {
            var client = new HttpClient
            {
                Timeout = TimeSpan.FromSeconds(4),
            };
            return client;
        }
    }

    public sealed class AgentHealthProbeResult
    {
        public bool Success { get; private set; }

        public string Message { get; private set; } = string.Empty;

        public static AgentHealthProbeResult Ok(string message)
        {
            return new AgentHealthProbeResult
            {
                Success = true,
                Message = message ?? string.Empty,
            };
        }

        public static AgentHealthProbeResult Fail(string message)
        {
            return new AgentHealthProbeResult
            {
                Success = false,
                Message = message ?? string.Empty,
            };
        }
    }
}

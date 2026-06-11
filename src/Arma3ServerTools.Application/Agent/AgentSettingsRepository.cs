using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.IO;
using Newtonsoft.Json.Linq;

namespace Arma3ServerTools.Application.Agent
{
    public sealed class AgentSettingsRepository
    {
        private readonly IAppPaths paths;

        public AgentSettingsRepository(IAppPaths paths)
        {
            this.paths = paths ?? throw new ArgumentNullException(nameof(paths));
        }

        public string GetSettingsPath()
        {
            string agentDirectory = Path.Combine(paths.ConfigDirectory, "agent");
            Directory.CreateDirectory(agentDirectory);
            return Path.Combine(agentDirectory, "settings.json");
        }

        public string GetInboxDirectory()
        {
            string inbox = Path.Combine(paths.ConfigDirectory, "agent", "inbox");
            Directory.CreateDirectory(inbox);
            Directory.CreateDirectory(Path.Combine(inbox, "processed"));
            Directory.CreateDirectory(Path.Combine(inbox, "failed"));
            return inbox;
        }

        public AgentSettings LoadOrCreate()
        {
            string settingsPath = GetSettingsPath();
            if (!File.Exists(settingsPath))
            {
                AgentSettings defaults = CreateDefaults();
                Save(defaults);
                return defaults;
            }

            string existing = File.ReadAllText(settingsPath);
            JObject root = JObject.Parse(existing);
            StripLegacyOneBotSection(root);
            MigrateLegacyListenPrefix(root);

            AgentSettings loaded = JsonSerializer.FromJson<AgentSettings>(root.ToString());
            if (loaded == null)
            {
                return CreateDefaults();
            }

            Normalize(loaded);
            return loaded;
        }

        public void Save(AgentSettings settings)
        {
            if (settings == null)
            {
                throw new ArgumentNullException(nameof(settings));
            }

            Normalize(settings);
            File.WriteAllText(GetSettingsPath(), JsonSerializer.ToJson(settings));
        }

        private static AgentSettings CreateDefaults()
        {
            return new AgentSettings
            {
                Http = new AgentHttpSettings
                {
                    Enabled = true,
                    RemoteAccessEnabled = false,
                    ListenHost = "127.0.0.1",
                    ListenPort = 19580,
                    ApiToken = Guid.NewGuid().ToString("N"),
                },
                Inbox = new AgentInboxSettings
                {
                    Enabled = true,
                    PollSeconds = 5,
                },
            };
        }

        private static void Normalize(AgentSettings loaded)
        {
            if (loaded.Http == null)
            {
                loaded.Http = new AgentHttpSettings();
            }

            if (loaded.Inbox == null)
            {
                loaded.Inbox = new AgentInboxSettings();
            }

            if (loaded.FileUpload == null)
            {
                loaded.FileUpload = new AgentFileUploadSettings();
            }

            if (loaded.SteamCmd == null)
            {
                loaded.SteamCmd = new AgentSteamCmdSettings();
            }

            if (loaded.Http.AllowedCallerIps == null)
            {
                loaded.Http.AllowedCallerIps = new List<string>();
            }
        }

        private static void StripLegacyOneBotSection(JObject root)
        {
            if (root == null)
            {
                return;
            }

            JProperty oneBot = root.Property("oneBot");
            if (oneBot != null)
            {
                oneBot.Remove();
            }
        }

        private static void MigrateLegacyListenPrefix(JObject root)
        {
            if (root == null)
            {
                return;
            }

            JToken httpToken = root["http"];
            if (httpToken == null || httpToken.Type != JTokenType.Object)
            {
                return;
            }

            JObject http = (JObject)httpToken;
            if (http["remoteAccessEnabled"] != null)
            {
                return;
            }

            string listenPrefix = http.Value<string>("listenPrefix");
            if (string.IsNullOrWhiteSpace(listenPrefix))
            {
                return;
            }

            if (listenPrefix.IndexOf("127.0.0.1", StringComparison.OrdinalIgnoreCase) >= 0
                || listenPrefix.IndexOf("localhost", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return;
            }

            http["remoteAccessEnabled"] = true;
            http["listenPrefix"] = listenPrefix;
        }
    }
}

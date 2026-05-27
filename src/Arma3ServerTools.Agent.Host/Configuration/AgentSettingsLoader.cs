using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Arma3ServerTools.Agent.Host.Configuration
{
    public static class AgentSettingsLoader
    {
        public static string GetSettingsPath(IAppPaths paths)
        {
            string agentDirectory = Path.Combine(paths.ConfigDirectory, "agent");
            Directory.CreateDirectory(agentDirectory);
            return Path.Combine(agentDirectory, "settings.json");
        }

        public static string GetInboxDirectory(IAppPaths paths)
        {
            string inbox = Path.Combine(paths.ConfigDirectory, "agent", "inbox");
            Directory.CreateDirectory(inbox);
            string processed = Path.Combine(inbox, "processed");
            Directory.CreateDirectory(processed);
            string failed = Path.Combine(inbox, "failed");
            Directory.CreateDirectory(failed);
            return inbox;
        }

        public static AgentSettings LoadOrCreate(IAppPaths paths)
        {
            string settingsPath = GetSettingsPath(paths);
            if (!File.Exists(settingsPath))
            {
                AgentSettings defaults = CreateDefaults();
                string json = JsonConvert.SerializeObject(defaults, Formatting.Indented);
                File.WriteAllText(settingsPath, json);
                return defaults;
            }

            string existing = File.ReadAllText(settingsPath);
            JObject root = JObject.Parse(existing);
            StripLegacyOneBotSection(root);
            MigrateLegacyListenPrefix(root);

            AgentSettings loaded = root.ToObject<AgentSettings>();
            if (loaded == null)
            {
                return CreateDefaults();
            }

            if (loaded.Http == null)
            {
                loaded.Http = new AgentHttpSettings();
            }

            if (loaded.Inbox == null)
            {
                loaded.Inbox = new AgentInboxSettings();
            }

            if (loaded.Http.AllowedCallerIps == null)
            {
                loaded.Http.AllowedCallerIps = new List<string>();
            }

            return loaded;
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
    }
}

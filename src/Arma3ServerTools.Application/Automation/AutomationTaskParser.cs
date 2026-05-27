using System;
using System.IO;
using Newtonsoft.Json;

namespace Arma3ServerTools.Application.Automation
{
    public static class AutomationTaskParser
    {
        public static AutomationTaskDocument ParseJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new ArgumentException("任务 JSON 为空。", nameof(json));
            }

            AutomationTaskDocument document = JsonConvert.DeserializeObject<AutomationTaskDocument>(json);
            if (document == null)
            {
                throw new InvalidOperationException("无法解析任务 JSON。");
            }

            if (document.Commands == null)
            {
                document.Commands = new System.Collections.Generic.List<AutomationCommand>();
            }

            return document;
        }

        public static AutomationTaskDocument LoadFromFile(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
            {
                throw new ArgumentException("任务文件路径为空。", nameof(filePath));
            }

            if (!File.Exists(filePath))
            {
                throw new FileNotFoundException("找不到任务文件: " + filePath, filePath);
            }

            string json = File.ReadAllText(filePath);
            AutomationTaskDocument document = ParseJson(json);
            document.TaskId = string.IsNullOrWhiteSpace(document.TaskId)
                ? Path.GetFileNameWithoutExtension(filePath)
                : document.TaskId;
            return document;
        }

        public static AutomationTaskDocument TryParseChatCommand(string line, string defaultServerUuid)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                return null;
            }

            string trimmed = line.Trim();
            if (trimmed.StartsWith("{", StringComparison.Ordinal))
            {
                return ParseJson(trimmed);
            }

            string[] parts = trimmed.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0)
            {
                return null;
            }

            var document = new AutomationTaskDocument
            {
                ServerUuid = defaultServerUuid,
            };
            string verb = parts[0].ToLowerInvariant();
            if (verb == "help" || verb == "帮助")
            {
                document.Commands.Add(new AutomationCommand { Action = "help" });
                return document;
            }

            if (verb == "status" || verb == "状态")
            {
                document.Commands.Add(new AutomationCommand { Action = "status" });
                return document;
            }

            if (verb == "stop" || verb == "停服")
            {
                document.Commands.Add(new AutomationCommand { Action = "stop" });
                ApplyServerSelector(document, parts, 1);
                return document;
            }

            if (verb == "start" || verb == "启服")
            {
                document.Commands.Add(new AutomationCommand { Action = "start" });
                ApplyServerSelector(document, parts, 1);
                return document;
            }

            if (verb == "restart" || verb == "重启")
            {
                document.Commands.Add(new AutomationCommand { Action = "restart" });
                ApplyServerSelector(document, parts, 1);
                return document;
            }

            if (verb == "mission" || verb == "任务")
            {
                if (parts.Length < 2)
                {
                    return null;
                }

                document.Commands.Add(new AutomationCommand
                {
                    Action = "switch_mission",
                    MissionTemplate = parts[1],
                    RestartAfterMission = true,
                });
                ApplyServerSelector(document, parts, 2);
                return document;
            }

            if (verb == "mods" || verb == "模组")
            {
                if (parts.Length < 3)
                {
                    return null;
                }

                string sub = parts[1].ToLowerInvariant();
                if (sub != "download" && sub != "下载")
                {
                    return null;
                }

                var command = new AutomationCommand
                {
                    Action = "download_mods",
                    EnableModsOnServer = true,
                };
                for (int i = 2; i < parts.Length; i++)
                {
                    string[] idParts = parts[i].Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
                    for (int j = 0; j < idParts.Length; j++)
                    {
                        if (ulong.TryParse(idParts[j].Trim(), out ulong modId) && modId > 0)
                        {
                            command.ModIds.Add(modId);
                        }
                    }
                }

                if (command.ModIds.Count == 0)
                {
                    return null;
                }

                document.Commands.Add(command);
                return document;
            }

            if (verb == "update" || verb == "更新")
            {
                if (parts.Length >= 2 && string.Equals(parts[1], "server", StringComparison.OrdinalIgnoreCase))
                {
                    document.Commands.Add(new AutomationCommand { Action = "update_server" });
                    ApplyServerSelector(document, parts, 2);
                    return document;
                }
            }

            if (verb == "write" || verb == "应用")
            {
                document.Commands.Add(new AutomationCommand { Action = "write_cfg" });
                ApplyServerSelector(document, parts, 1);
                return document;
            }

            return null;
        }

        private static void ApplyServerSelector(AutomationTaskDocument document, string[] parts, int nameIndex)
        {
            if (parts.Length <= nameIndex)
            {
                return;
            }

            string candidate = parts[nameIndex];
            if (Guid.TryParse(candidate, out _))
            {
                document.ServerUuid = candidate;
                return;
            }

            document.ServerName = candidate;
        }
    }
}

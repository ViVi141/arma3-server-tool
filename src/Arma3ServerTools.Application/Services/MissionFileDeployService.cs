using System;
using System.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class MissionFileDeployResult
    {
        public string Template { get; set; }

        public string FullPath { get; set; }

        public long FileSize { get; set; }
    }

    public sealed class MissionFileDeployService
    {
        private readonly IServerConfigService configService;

        public MissionFileDeployService(IServerConfigService configService)
        {
            this.configService = configService;
        }

        public (OperationResult Result, MissionFileDeployResult Data) DeployPbo(
            string serverUuid,
            string fileName,
            Stream content,
            bool addToMissionList,
            int missionDifficulty)
        {
            if (content == null)
            {
                return (OperationResult.Fail("文件内容为空。"), null);
            }

            string safeName = SanitizePboFileName(fileName);
            if (string.IsNullOrEmpty(safeName))
            {
                return (OperationResult.Fail("无效的任务文件名。"), null);
            }

            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return (OperationResult.Fail("未找到服务器: " + serverUuid), null);
            }

            if (string.IsNullOrWhiteSpace(config.ServerDir))
            {
                return (OperationResult.Fail("服务器目录未配置。"), null);
            }

            string missionsDir = Path.Combine(config.ServerDir.Trim(), "MPMissions");
            Directory.CreateDirectory(missionsDir);
            string targetPath = Path.Combine(missionsDir, safeName);
            string fullPath = Path.GetFullPath(targetPath);
            string fullMissionsDir = Path.GetFullPath(missionsDir);
            if (!fullPath.StartsWith(fullMissionsDir, StringComparison.OrdinalIgnoreCase))
            {
                return (OperationResult.Fail("目标路径非法。"), null);
            }

            string tempPath = fullPath + ".uploading";
            using (FileStream fileStream = File.Create(tempPath))
            {
                content.CopyTo(fileStream);
            }

            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
            }

            File.Move(tempPath, fullPath);

            if (addToMissionList)
            {
                PromoteMissionInConfig(config, safeName, missionDifficulty);
                config.SetTime();
                configService.Save(config);
            }

            var deployResult = new MissionFileDeployResult
            {
                Template = safeName,
                FullPath = fullPath,
                FileSize = new FileInfo(fullPath).Length,
            };

            return (
                OperationResult.Ok("已部署任务: " + safeName),
                deployResult);
        }

        public static string SanitizePboFileName(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return string.Empty;
            }

            string trimmed = fileName.Trim();
            if (trimmed.IndexOf("..", StringComparison.Ordinal) >= 0)
            {
                return string.Empty;
            }

            string name = Path.GetFileName(trimmed);
            if (!string.Equals(trimmed, name, StringComparison.OrdinalIgnoreCase))
            {
                return string.Empty;
            }

            if (!name.EndsWith(".pbo", StringComparison.OrdinalIgnoreCase))
            {
                if (name.IndexOf('.') < 0)
                {
                    name += ".pbo";
                }
                else
                {
                    return string.Empty;
                }
            }

            foreach (char invalid in Path.GetInvalidFileNameChars())
            {
                if (name.IndexOf(invalid) >= 0)
                {
                    return string.Empty;
                }
            }

            return name;
        }

        private static void PromoteMissionInConfig(ArmaServerConfig config, string template, int difficulty)
        {
            if (config.ServerConfig.missions == null)
            {
                config.ServerConfig.missions = new System.Collections.Generic.List<MissionsEntity>();
            }

            MissionsEntity existing = null;
            for (int i = 0; i < config.ServerConfig.missions.Count; i++)
            {
                MissionsEntity mission = config.ServerConfig.missions[i];
                if (mission != null
                    && string.Equals(mission.Template, template, StringComparison.OrdinalIgnoreCase))
                {
                    existing = mission;
                    break;
                }
            }

            if (existing == null)
            {
                config.ServerConfig.missions.Insert(
                    0,
                    new MissionsEntity(template, difficulty, false, false));
            }
            else
            {
                existing.Difficulty = difficulty;
                config.ServerConfig.missions.Remove(existing);
                config.ServerConfig.missions.Insert(0, existing);
            }
        }
    }
}

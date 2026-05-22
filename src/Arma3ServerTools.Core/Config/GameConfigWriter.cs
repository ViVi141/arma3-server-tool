using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.NetworkInformation;
using System.Text;
using Arma3ServerTools.Core.Missions;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Core.Config
{
    /// <summary>
    /// Writes Arma 3 server.cfg, basic.cfg, profile and BattlEye config files to disk.
    /// </summary>
    public sealed class GameConfigWriter
    {
        public static readonly UTF8Encoding Utf8NoBom = GameConfigFormat.Utf8NoBom;

        public OperationResult WriteAll(ArmaServerConfig config)
        {
            if (config == null)
            {
                return OperationResult.Fail("配置不能为空。");
            }

            if (string.IsNullOrEmpty(config.ServerDir) || string.IsNullOrEmpty(config.ServerUUID))
            {
                return OperationResult.Fail("服务器目录或 UUID 未设置。");
            }

            try
            {
                EnsureConfigDirectories(config);
                WriteServerCfg(config);
                WriteBasicCfg(config);
                WriteServerProfile(config);
                WriteBattlEyeCfg(config);
                return OperationResult.Ok();
            }
            catch (ConfigException ex)
            {
                return OperationResult.Fail(ex.Message);
            }
            catch (Exception ex)
            {
                return OperationResult.Fail("保存失败: " + ex.Message);
            }
        }

        public string BuildHeadlessClientCommandLine(ArmaServerConfig config)
        {
            var sb = new StringBuilder();
            if (!string.IsNullOrEmpty(config.ServerConfig.Password))
            {
                sb.Append(" ").Append("-password=").Append(config.ServerConfig.Password);
            }

            int hcPort = config.StartupParameters.Port + 5;
            for (int i = 0; i < 10; i++)
            {
                var random = new Random();
                hcPort = random.Next(100) + config.StartupParameters.Port;
                if (!IsPortInUse(hcPort))
                {
                    break;
                }
            }

            sb.Append(" -limitFPS=1000 -client -connect=127.0.0.1:")
                .Append(config.StartupParameters.Port)
                .Append(" -prot=")
                .Append(hcPort);
            sb.Append(" ")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append("-profiles=")
                .Append(config.ServerDir + @"\" + ToolConstants.ServerConfigFolderName + @"\")
                .Append(config.ServerUUID)
                .Append(GameConfigFormat.DoubleQuotes);
            sb.Append(" ")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append("-name=")
                .Append(config.ServerUUID)
                .Append(GameConfigFormat.DoubleQuotes);

            string headlessClientMod = string.Empty;
            foreach (ModsEntity entity in config.StartupParameters.modsEntities)
            {
                if (entity.HeadlessClientMod)
                {
                    headlessClientMod += entity.ModPath + GameConfigFormat.Semicolon;
                }
            }

            sb.Append(" ")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append("-mod=")
                .Append(headlessClientMod)
                .Append(GameConfigFormat.DoubleQuotes);
            sb.Append(" -noPause -noSound");
            return sb.ToString();
        }

        public string BuildStartCommandLine(ArmaServerConfig config)
        {
            var sb = new StringBuilder();
            if (config.StartupParameters.AutoInit)
            {
                sb.Append(" -autoInit");
            }

            if (config.StartupParameters.FilePatching)
            {
                sb.Append(" -filePatching");
            }

            if (!string.IsNullOrEmpty(config.StartupParameters.PidFile))
            {
                sb.Append(" -pid=").Append(config.StartupParameters.PidFile);
            }

            if (!string.IsNullOrEmpty(config.StartupParameters.Ranking))
            {
                sb.Append(" -ranking=").Append(config.StartupParameters.Ranking);
            }

            sb.Append(" -port=").Append(config.StartupParameters.Port.ToString());

            if (config.StartupParameters.BandwidthAlg)
            {
                sb.Append(" -bandwidthAlg=2");
            }

            if (config.StartupParameters.EnableHT)
            {
                sb.Append(" -enableHT");
            }

            if (config.StartupParameters.Hugepages)
            {
                sb.Append(" -hugepages");
            }

            if (config.StartupParameters.LoadMissionToMemory)
            {
                sb.Append(" -loadMissionToMemory");
            }

            if (config.StartupParameters.DisableServerThread)
            {
                sb.Append(" -disableServerThread");
            }

            if (config.StartupParameters.CpuCount > 0)
            {
                sb.Append(" -cpuCount=").Append(config.StartupParameters.CpuCount);
            }

            if (config.StartupParameters.ExThreads > 0)
            {
                sb.Append(" -exThreads=").Append(config.StartupParameters.ExThreads);
            }

            if (config.StartupParameters.MaxMem > 0)
            {
                sb.Append(" -maxMem=").Append(config.StartupParameters.MaxMem);
            }

            sb.Append(" -limitFPS=").Append(config.StartupParameters.LimitFPS.ToString());

            if (config.StartupParameters.NoLogs)
            {
                sb.Append(" -noLogs");
            }

            if (config.StartupParameters.Netlog)
            {
                sb.Append(" -netlog");
            }

            string configRoot = config.ServerDir + @"\" + ToolConstants.ServerConfigFolderName + @"\" + config.ServerUUID;
            sb.Append(" ")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append("-config=")
                .Append(configRoot)
                .Append(@"\server.cfg")
                .Append(GameConfigFormat.DoubleQuotes);
            sb.Append(" ")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append("-cfg=")
                .Append(configRoot)
                .Append(@"\basic.cfg")
                .Append(GameConfigFormat.DoubleQuotes);
            sb.Append(" ")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append("-profiles=")
                .Append(configRoot)
                .Append(GameConfigFormat.DoubleQuotes);
            sb.Append(" ")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append("-name=")
                .Append(config.ServerUUID)
                .Append(GameConfigFormat.DoubleQuotes);

            string clientMod = string.Empty;
            string serverMod = string.Empty;
            if (config.StartupParameters.DLCWS)
            {
                clientMod += "WS;";
            }

            if (config.StartupParameters.DLCVN)
            {
                clientMod += "VN;";
            }

            if (config.StartupParameters.DLCCSLA)
            {
                clientMod += "CSLA;";
            }

            if (config.StartupParameters.DLCGM)
            {
                clientMod += "GM;";
            }

            if (config.StartupParameters.DLCcontact)
            {
                clientMod += "contact;";
            }

            foreach (ModsEntity entity in config.StartupParameters.modsEntities)
            {
                if (entity.LocalMod)
                {
                    clientMod += entity.ModPath + GameConfigFormat.Semicolon;
                }

                if (entity.ServerMod)
                {
                    serverMod += entity.ModPath + GameConfigFormat.Semicolon;
                }
            }

            if (config.ServerTaskManagement.EnableMonitor)
            {
                serverMod += ToolConstants.MonitoringServerModToken + GameConfigFormat.Semicolon;
            }

            sb.Append(" ")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append("-mod=")
                .Append(clientMod)
                .Append(GameConfigFormat.DoubleQuotes);
            sb.Append(" ")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append("-serverMod=")
                .Append(serverMod)
                .Append(GameConfigFormat.DoubleQuotes);

            AppendStartupExtraArgs(sb, config.StartupParameters.StartConfigArgs);

            config.StartCommandLine = sb.ToString();
            return config.StartCommandLine;
        }

        internal static void AppendStartupExtraArgs(StringBuilder sb, string startConfigArgs)
        {
            string decoded;
            if (!GameConfigEncoding.TryDecodeBase64(startConfigArgs, out decoded))
            {
                return;
            }

            if (string.IsNullOrEmpty(decoded))
            {
                return;
            }

            string[] extraArgs = decoded.Split(
                new[] { "\r\n", "\n" },
                StringSplitOptions.RemoveEmptyEntries);
            foreach (string arg in extraArgs)
            {
                string trimmed = arg.Trim();
                if (string.IsNullOrEmpty(trimmed))
                {
                    continue;
                }

                sb.Append(" ").Append(trimmed);
            }
        }

        public static bool IsPortInUse(int port)
        {
            IPGlobalProperties properties = IPGlobalProperties.GetIPGlobalProperties();
            return properties.GetActiveUdpListeners().Any(endpoint => endpoint.Port == port);
        }

        private static void EnsureConfigDirectories(ArmaServerConfig config)
        {
            string root = config.ServerDir + @"\" + ToolConstants.ServerConfigFolderName;
            string serverRoot = root + @"\" + config.ServerUUID;
            string usersRoot = serverRoot + @"\Users";
            string profileRoot = usersRoot + @"\" + config.ServerUUID;
            string beRoot = serverRoot + @"\BattlEye";

            Directory.CreateDirectory(root);
            Directory.CreateDirectory(serverRoot);
            Directory.CreateDirectory(usersRoot);
            Directory.CreateDirectory(profileRoot);
            Directory.CreateDirectory(beRoot);
        }

        private static void WriteServerCfg(ArmaServerConfig config)
        {
            var sb = new StringBuilder();
            sb.Append("hostname=")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append(config.ServerConfig.HostName)
                .Append(GameConfigFormat.DoubleQuotes)
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("password=")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append(config.ServerConfig.Password)
                .Append(GameConfigFormat.DoubleQuotes)
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("maxPlayers=")
                .Append(config.ServerConfig.MaxPlayers.ToString())
                .AppendLine(GameConfigFormat.Semicolon);

            string persistentValue;
            if (config.ServerConfig.Persistent)
            {
                persistentValue = "1";
            }
            else
            {
                persistentValue = "0";
            }

            sb.Append("persistent=").Append(persistentValue).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("skipLobby=")
                .Append(config.ServerConfig.SkipLobby.ToString().ToLower())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("drawingInMap=")
                .Append(config.ServerConfig.DrawingInMap.ToString().ToLower())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("statisticsEnabled=")
                .Append(config.ServerConfig.StatisticsEnabled.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("forceRotorLibSimulation=")
                .Append(config.ServerConfig.ForceRotorLibSimulation.ToString())
                .AppendLine(GameConfigFormat.Semicolon);

            if (config.ServerConfig.ForcedDifficulty != "none")
            {
                sb.Append("forcedDifficulty=")
                    .Append(GameConfigFormat.DoubleQuotes)
                    .Append(config.ServerConfig.ForcedDifficulty)
                    .Append(GameConfigFormat.DoubleQuotes)
                    .AppendLine(GameConfigFormat.Semicolon);
            }

            if (config.ServerConfig.Motd.Count > 0)
            {
                WriteCfgArray("motd[]=", sb, config.ServerConfig.Motd);
            }

            sb.Append("motdInterval=")
                .Append(config.ServerConfig.MotdInterval.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("disableVoN=")
                .Append(config.ServerConfig.DisableVoN.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("vonCodecQuality=")
                .Append(config.ServerConfig.VonCodecQuality.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("vonCodec=")
                .Append(config.ServerConfig.VonCodec.ToString())
                .AppendLine(GameConfigFormat.Semicolon);

            if (config.ServerConfig.HeadlessClients.Count > 0)
            {
                WriteCfgArray("headlessClients[]=", sb, config.ServerConfig.HeadlessClients);
            }

            if (config.ServerConfig.LocalClient.Count > 0)
            {
                WriteCfgArray("LocalClient[]=", sb, config.ServerConfig.LocalClient);
            }

            if (config.ServerConfig.VoteThreshold != 0)
            {
                sb.Append("voteThreshold=")
                    .Append(config.ServerConfig.VoteThreshold.ToString())
                    .AppendLine(GameConfigFormat.Semicolon);
            }

            if (config.ServerConfig.VotingTimeOut != 0)
            {
                sb.Append("votingTimeOut=")
                    .Append(config.ServerConfig.VotingTimeOut.ToString())
                    .AppendLine(GameConfigFormat.Semicolon);
            }

            sb.Append("roleTimeOut=")
                .Append(config.ServerConfig.RoleTimeOut.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("briefingTimeOut=")
                .Append(config.ServerConfig.BriefingTimeOut.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("debriefingTimeOut=")
                .Append(config.ServerConfig.DebriefingTimeOut.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("lobbyIdleTimeout=")
                .Append(config.ServerConfig.LobbyIdleTimeout.ToString())
                .AppendLine(GameConfigFormat.Semicolon);

            if (config.ServerConfig.VoteMissionPlayers != 0)
            {
                sb.Append("voteMissionPlayers=")
                    .Append(config.ServerConfig.VoteMissionPlayers.ToString())
                    .AppendLine(GameConfigFormat.Semicolon);
            }

            string battlEyeValue;
            if (config.ServerConfig.BattlEye)
            {
                battlEyeValue = "1";
            }
            else
            {
                battlEyeValue = "0";
            }

            sb.Append("BattlEye=").Append(battlEyeValue).AppendLine(GameConfigFormat.Semicolon);

            string verifySignaturesValue;
            if (config.ServerConfig.VerifySignatures)
            {
                verifySignaturesValue = "2";
            }
            else
            {
                verifySignaturesValue = "0";
            }

            sb.Append("verifySignatures=").Append(verifySignaturesValue).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("kickduplicate=")
                .Append(config.ServerConfig.Kickduplicate.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("allowedFilePatching=")
                .Append(config.ServerConfig.AllowedFilePatching.ToString())
                .AppendLine(GameConfigFormat.Semicolon);

            if (config.ServerConfig.FilePatchingExceptions.Count > 0)
            {
                WriteCfgArray("filePatchingExceptions[]=", sb, config.ServerConfig.FilePatchingExceptions);
            }

            sb.Append("serverCommandPassword=")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append(config.ServerConfig.ServerCommandPassword)
                .Append(GameConfigFormat.DoubleQuotes)
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("passwordAdmin=")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append(config.ServerConfig.PasswordAdmin)
                .Append(GameConfigFormat.DoubleQuotes)
                .AppendLine(GameConfigFormat.Semicolon);

            if (config.ServerConfig.Admins.Count > 0)
            {
                WriteCfgArray("admins[]=", sb, config.ServerConfig.Admins);
            }

            WriteCfgEvent("doubleIdDetected=", sb, config.ServerConfig.DoubleIdDetected);
            WriteCfgEvent("onUserConnected=", sb, config.ServerConfig.onUserConnected);
            WriteCfgEvent("onUserDisconnected=", sb, config.ServerConfig.onUserDisconnected);
            WriteCfgEvent("onHackedData=", sb, config.ServerConfig.onHackedData);
            WriteCfgEvent("onDifferentData=", sb, config.ServerConfig.onDifferentData);
            WriteCfgEvent("onUnsignedData=", sb, config.ServerConfig.onUnsignedData);
            WriteCfgEvent("onUserKicked=", sb, config.ServerConfig.onUserKicked);
            WriteCfgEvent("regularCheck=", sb, config.ServerConfig.RegularCheck);

            if (config.ServerConfig.AllowedLoadFileExtensions.Count > 0)
            {
                WriteCfgArray("allowedLoadFileExtensions[]=", sb, config.ServerConfig.AllowedLoadFileExtensions);
            }

            if (config.ServerConfig.AllowedPreprocessFileExtensions.Count > 0)
            {
                WriteCfgArray("allowedPreprocessFileExtensions[]=", sb, config.ServerConfig.AllowedPreprocessFileExtensions);
            }

            if (config.ServerConfig.AllowedHTMLLoadExtensions.Count > 0)
            {
                WriteCfgArray("allowedHTMLLoadExtensions[]=", sb, config.ServerConfig.AllowedHTMLLoadExtensions);
            }

            if (config.ServerConfig.AllowedHTMLLoadURIs.Count > 0)
            {
                WriteCfgArray("allowedHTMLLoadURIs[]=", sb, config.ServerConfig.AllowedHTMLLoadURIs);
            }

            sb.Append("upnp=")
                .Append(config.ServerConfig.UPNP.ToString().ToLower())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("steamProtocolMaxDataSize=")
                .Append(config.ServerConfig.SteamProtocolMaxDataSize.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("loopback=")
                .Append(config.ServerConfig.LoopBack.ToString().ToLower())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("disconnectTimeout=")
                .Append(config.ServerConfig.DisconnectTimeout.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("maxdesync=")
                .Append(config.ServerConfig.Maxdesync.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("maxping=")
                .Append(config.ServerConfig.MaxPing.ToString())
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("maxpacketloss=")
                .Append(config.ServerConfig.MaxPacketLoss.ToString())
                .AppendLine(GameConfigFormat.Semicolon);

            WriteMissions(sb, config);
            WriteMissionWhitelist(sb, config);

            if (config.ServerConfig.AutoSelectMission)
            {
                sb.Append("autoSelectMission=")
                    .Append(config.ServerConfig.AutoSelectMission.ToString())
                    .AppendLine(GameConfigFormat.Semicolon);
            }

            if (config.ServerConfig.RandomMissionOrder)
            {
                sb.Append("randomMissionOrder=")
                    .Append(config.ServerConfig.RandomMissionOrder.ToString())
                    .AppendLine(GameConfigFormat.Semicolon);
            }

            sb.Append("logFile=")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append(config.ServerConfig.LogFile)
                .Append(GameConfigFormat.DoubleQuotes)
                .AppendLine(GameConfigFormat.Semicolon);

            string timeStampFormat;
            if (config.ServerConfig.TimeStampFormat == 0)
            {
                timeStampFormat = "none";
            }
            else if (config.ServerConfig.TimeStampFormat == 1)
            {
                timeStampFormat = "short";
            }
            else
            {
                timeStampFormat = "full";
            }

            sb.Append("timeStampFormat=")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append(timeStampFormat)
                .Append(GameConfigFormat.DoubleQuotes)
                .AppendLine(GameConfigFormat.Semicolon);
            sb.Append("callExtReportLimit=")
                .Append(config.ServerConfig.CallExtReportLimit.ToString())
                .AppendLine(GameConfigFormat.Semicolon);

            AppendBase64DecodedLine(sb, config.ServerConfig.ServerConfigArgs);

            string path = config.ServerDir + @"\" + ToolConstants.ServerConfigFolderName + @"\" + config.ServerUUID + @"\server.cfg";
            try
            {
                File.WriteAllText(path, sb.ToString(), Utf8NoBom);
            }
            catch (Exception ex)
            {
                throw new ConfigException("写入 server.cfg 失败", ex);
            }
        }

        private static void WriteBasicCfg(ArmaServerConfig config)
        {
            var sb = new StringBuilder();
            sb.Append("MaxMsgSend=").Append(config.BasicConfig.MaxMsgSend.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("MaxSizeGuaranteed=").Append(config.BasicConfig.MaxSizeGuaranteed.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("MaxSizeNonguaranteed=").Append(config.BasicConfig.MaxSizeNonguaranteed.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("MinBandwidth=").Append(config.BasicConfig.MinBandwidth.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("MaxBandwidth=").Append(config.BasicConfig.MaxBandwidth.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("MinErrorToSend=").Append(config.BasicConfig.MinErrorToSend.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("MinErrorToSendNear=").Append(config.BasicConfig.MinErrorToSendNear.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("MaxPacketSize=").Append(config.BasicConfig.MaxPacketSize.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("MaxCustomFileSize=").Append(config.BasicConfig.MaxCustomFileSize.ToString()).AppendLine(GameConfigFormat.Semicolon);

            AppendBase64DecodedLine(sb, config.BasicConfig.BasicConfigArgs);

            string path = config.ServerDir + @"\" + ToolConstants.ServerConfigFolderName + @"\" + config.ServerUUID + @"\basic.cfg";
            try
            {
                File.WriteAllText(path, sb.ToString(), Utf8NoBom);
            }
            catch (Exception ex)
            {
                throw new ConfigException("写入 basic.cfg 失败", ex);
            }
        }

        private static void WriteServerProfile(ArmaServerConfig config)
        {
            var sb = new StringBuilder();
            sb.Append("difficulty=")
                .Append(GameConfigFormat.DoubleQuotes)
                .Append("CustomDifficulty")
                .Append(GameConfigFormat.DoubleQuotes)
                .AppendLine(GameConfigFormat.Semicolon);
            sb.AppendLine("class DifficultyPresets");
            sb.AppendLine(GameConfigFormat.LeftSquareBrackets);
            sb.Append(GameConfigFormat.Tab).AppendLine("class CustomDifficulty");
            sb.Append(GameConfigFormat.Tab).AppendLine(GameConfigFormat.LeftSquareBrackets);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).AppendLine("class Options");
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).AppendLine(GameConfigFormat.LeftSquareBrackets);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("groupIndicators=").Append(config.serverProfile.GroupIndicators.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("friendlyTags=").Append(config.serverProfile.FriendlyTags.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("enemyTags=").Append(config.serverProfile.EnemyTags.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("detectedMines=").Append(config.serverProfile.DetectedMines.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("commands=").Append(config.serverProfile.Commands.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("waypoints=").Append(config.serverProfile.WayPoints.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("tacticalPing=").Append(config.serverProfile.TacticalPing.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("weaponInfo=").Append(config.serverProfile.WeaponInfo.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("stanceIndicator=").Append(config.serverProfile.StanceIndicator.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("staminaBar=").Append(config.serverProfile.StaminaBar.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("weaponCrosshair=").Append(config.serverProfile.WeaponCrosshair.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("visionAid=").Append(config.serverProfile.VisionAid.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("thirdPersonView=").Append(config.serverProfile.ThirdPersonView.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("cameraShake=").Append(config.serverProfile.CameraShake.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("scoreTable=").Append(config.serverProfile.ScoreTable.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("deathMessages=").Append(config.serverProfile.DeathMessages.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("vonID=").Append(config.serverProfile.VonID.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("mapContent=").Append(config.serverProfile.MapContent.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("mapContentFriendly=").Append(config.serverProfile.MapContentFriendly.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("mapContentEnemy=").Append(config.serverProfile.MapContentEnemy.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("mapContentMines=").Append(config.serverProfile.MapContentMines.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("reducedDamage=").Append(config.serverProfile.ReducedDamage.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("autoReport=").Append(config.serverProfile.AutoReport.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("multipleSaves=").Append(config.serverProfile.MultipleSaves.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append(GameConfigFormat.RightSquareBrackets).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("description=").Append(GameConfigFormat.DoubleQuotes).Append("Arma3 Server Tools 自定义难度（CustomDifficulty）").Append(GameConfigFormat.DoubleQuotes).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("aiLevelPreset=3").AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.RightSquareBrackets).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).AppendLine("class CustomAILevel");
            sb.Append(GameConfigFormat.Tab).AppendLine(GameConfigFormat.LeftSquareBrackets);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("skillAI=").Append(config.serverProfile.SkillAI).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.Tab).Append("precisionAI=").Append(config.serverProfile.PrecisionAI).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.Tab).Append(GameConfigFormat.RightSquareBrackets).AppendLine(GameConfigFormat.Semicolon);
            sb.Append(GameConfigFormat.RightSquareBrackets).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("TerrainGrid=").Append(config.BasicConfig.TerrainGrid.ToString()).AppendLine(GameConfigFormat.Semicolon);
            sb.Append("ViewDistance=").Append(config.BasicConfig.ViewDistance.ToString()).AppendLine(GameConfigFormat.Semicolon);

            AppendBase64DecodedLine(sb, config.serverProfile.ServerProfileArgs);

            string path = config.ServerDir + @"\" + ToolConstants.ServerConfigFolderName + @"\" + config.ServerUUID + @"\Users\" + config.ServerUUID + @"\" + config.ServerUUID + ".Arma3Profile";
            try
            {
                File.WriteAllText(path, sb.ToString(), Utf8NoBom);
            }
            catch (Exception ex)
            {
                throw new ConfigException("写入 Arma3Profile 失败", ex);
            }
        }

        private static void WriteBattlEyeCfg(ArmaServerConfig config)
        {
            var sb = new StringBuilder();
            sb.Append("RConPassword").Append(" ").AppendLine(config.BattlEyeConfig.RConPassword);
            sb.Append("RConPort").Append(" ").AppendLine(config.BattlEyeConfig.RConPort.ToString());

            AppendBeInterval(sb, "MaxCreateVehiclePerInterval", config.BattlEyeConfig.MaxCreateVehiclePerInterval);
            AppendBeInterval(sb, "MaxSetPosPerInterval", config.BattlEyeConfig.MaxSetPosPerInterval);
            AppendBeInterval(sb, "MaxDeleteVehiclePerInterval", config.BattlEyeConfig.MaxDeleteVehiclePerInterval);
            AppendBeInterval(sb, "MaxSetDamagePerInterval", config.BattlEyeConfig.MaxSetDamagePerInterval);
            AppendBeInterval(sb, "MaxAddBackpackCargoPerInterval", config.BattlEyeConfig.MaxAddBackpackCargoPerInterval);
            AppendBeInterval(sb, "MaxAddMagazineCargoPerInterval", config.BattlEyeConfig.MaxAddMagazineCargoPerInterval);
            AppendBeInterval(sb, "MaxAddWeaponCargoPerInterval", config.BattlEyeConfig.MaxAddWeaponCargoPerInterval);

            string beDir = config.ServerDir + @"\" + ToolConstants.ServerConfigFolderName + @"\" + config.ServerUUID + @"\BattlEye";
            try
            {
                File.WriteAllText(beDir + @"\BEServer_x64.cfg", sb.ToString(), Utf8NoBom);
                File.WriteAllText(beDir + @"\BEServer.cfg", sb.ToString(), Utf8NoBom);
            }
            catch (Exception ex)
            {
                throw new ConfigException("写入 BEServer 配置失败", ex);
            }
        }

        private static void AppendBeInterval(StringBuilder sb, string key, BEServerCfgEntity interval)
        {
            if (interval.MaxNumbe != 0 && interval.Seconds != 0)
            {
                sb.Append(key)
                    .Append(" ")
                    .Append(interval.MaxNumbe)
                    .Append(" ")
                    .AppendLine(interval.Seconds.ToString());
            }
        }

        private static void WriteMissions(StringBuilder sb, ArmaServerConfig config)
        {
            if (config.ServerConfig.missions.Count < 1)
            {
                return;
            }

            bool wroteClass = false;
            for (int i = 0; i < config.ServerConfig.missions.Count; i++)
            {
                MissionsEntity mission = config.ServerConfig.missions[i];
                if (!mission.Choose)
                {
                    continue;
                }

                if (!wroteClass)
                {
                    sb.Append("class Missions ").AppendLine(GameConfigFormat.LeftSquareBrackets);
                    wroteClass = true;
                }

                sb.Append(GameConfigFormat.Tab)
                    .Append("class ")
                    .Append(ToolConstants.BattlEyeMissionClassPrefix)
                    .Append((i + 1).ToString())
                    .AppendLine(GameConfigFormat.LeftSquareBrackets);
                sb.Append(GameConfigFormat.Tab)
                    .Append(GameConfigFormat.Tab)
                    .Append("template = ")
                    .Append(GameConfigFormat.DoubleQuotes)
                    .Append(mission.Template.Replace(".pbo", string.Empty))
                    .Append(GameConfigFormat.DoubleQuotes)
                    .AppendLine(GameConfigFormat.Semicolon);
                sb.Append(GameConfigFormat.Tab)
                    .Append(GameConfigFormat.Tab)
                    .Append("difficulty = ")
                    .Append(GameConfigFormat.DoubleQuotes)
                    .Append(MissionsTool.IntToDifficulty(mission.Difficulty))
                    .Append(GameConfigFormat.DoubleQuotes)
                    .AppendLine(GameConfigFormat.Semicolon);

                string missionParams;
                if (config.MissionParams.TryGetValue(mission.Template, out missionParams))
                {
                    string[] arr = missionParams.Split(new[] { Environment.NewLine }, StringSplitOptions.None);
                    var missionSb = new StringBuilder();
                    foreach (string param in arr)
                    {
                        missionSb.Append(GameConfigFormat.Tab)
                            .Append(GameConfigFormat.Tab)
                            .Append(GameConfigFormat.Tab)
                            .AppendLine(param);
                    }

                    sb.Append(GameConfigFormat.Tab)
                        .Append(GameConfigFormat.Tab)
                        .Append("class Params")
                        .AppendLine()
                        .Append(GameConfigFormat.Tab)
                        .Append(GameConfigFormat.Tab)
                        .AppendLine(GameConfigFormat.LeftSquareBrackets)
                        .Append(missionSb)
                        .AppendLine()
                        .Append(GameConfigFormat.Tab)
                        .Append(GameConfigFormat.Tab)
                        .Append(GameConfigFormat.RightSquareBrackets)
                        .AppendLine(GameConfigFormat.Semicolon);
                }

                sb.Append(GameConfigFormat.Tab)
                    .Append(GameConfigFormat.RightSquareBrackets)
                    .AppendLine(GameConfigFormat.Semicolon);
            }

            if (wroteClass)
            {
                sb.Append(GameConfigFormat.RightSquareBrackets).AppendLine(GameConfigFormat.Semicolon);
            }
        }

        private static void WriteMissionWhitelist(StringBuilder sb, ArmaServerConfig config)
        {
            var whitelist = new StringBuilder();
            whitelist.Append("missionWhitelist[] = ").AppendLine(GameConfigFormat.LeftSquareBrackets);
            bool wroteComma = false;
            for (int i = 0; i < config.ServerConfig.missions.Count; i++)
            {
                MissionsEntity mission = config.ServerConfig.missions[i];
                if (!mission.WhiteList)
                {
                    continue;
                }

                whitelist.Append(GameConfigFormat.Tab)
                    .Append(GameConfigFormat.DoubleQuotes)
                    .Append(mission.Template.Replace(".pbo", string.Empty))
                    .Append(GameConfigFormat.DoubleQuotes)
                    .AppendLine(GameConfigFormat.Comma);
                wroteComma = true;
            }

            if (wroteComma)
            {
                string text = whitelist.ToString();
                int lastComma = text.LastIndexOf(',');
                string trimmed = text.Remove(lastComma, 1);
                sb.Append(trimmed)
                    .Append(GameConfigFormat.RightSquareBrackets)
                    .AppendLine(GameConfigFormat.Semicolon);
            }
        }

        private static void WriteCfgEvent(string key, StringBuilder sb, string text)
        {
            try
            {
                text = Encoding.Default.GetString(Convert.FromBase64String(text));
                text = text.Replace(GameConfigFormat.DoubleQuotes, "'");
            }
            catch
            {
                text = string.Empty;
            }

            sb.Append(key)
                .Append(GameConfigFormat.DoubleQuotes)
                .Append(text)
                .Append(GameConfigFormat.DoubleQuotes)
                .AppendLine(GameConfigFormat.Semicolon);
        }

        private static void WriteCfgArray(string key, StringBuilder sb, List<string> values)
        {
            sb.Append(key).AppendLine(GameConfigFormat.LeftSquareBrackets);
            for (int i = 0; i < values.Count; i++)
            {
                if (string.IsNullOrEmpty(values[i]))
                {
                    continue;
                }

                sb.Append(GameConfigFormat.Tab)
                    .Append(GameConfigFormat.DoubleQuotes)
                    .Append(values[i])
                    .Append(GameConfigFormat.DoubleQuotes);

                if (i == values.Count - 1)
                {
                    sb.AppendLine(string.Empty);
                }
                else
                {
                    sb.AppendLine(GameConfigFormat.Comma);
                }
            }

            sb.Append("}").AppendLine(GameConfigFormat.Semicolon);
        }

        private static void AppendBase64DecodedLine(StringBuilder sb, string base64)
        {
            string decoded;
            if (GameConfigEncoding.TryDecodeBase64(base64, out decoded))
            {
                sb.AppendLine(decoded);
            }
        }
    }
}

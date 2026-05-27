using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Core.Models;
using AntCheckbox = AntdUI.Checkbox;
using AntLabel = AntdUI.Label;
using AntInputNumber = AntdUI.InputNumber;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class PerformanceSettingsPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntCheckbox enableHtCheckBox;
        private readonly AntCheckbox hugepagesCheckBox;
        private readonly AntCheckbox loadMissionCheckBox;
        private readonly AntCheckbox disableServerThreadCheckBox;
        private readonly AntInputNumber cpuCountNumeric;
        private readonly AntInputNumber exThreadsNumeric;
        private readonly AntInputNumber maxMemNumeric;
        private readonly AntInputNumber limitFpsNumeric;
        private readonly AntInputNumber terrainGridNumeric;
        private readonly AntInputNumber viewDistanceNumeric;
        private readonly AntInputNumber armaUnitsTimeoutNumeric;
        private readonly AntCheckbox logObjectNotFoundCheckBox;
        private readonly AntCheckbox skipDescriptionParsingCheckBox;
        private readonly AntCheckbox ignoreMissionLoadErrorsCheckBox;
        private readonly AntInputNumber queueSizeLogGNumeric;

        private ArmaServerConfig boundConfig;

        public PerformanceSettingsPanel()
        {
            Dock = DockStyle.Fill;
            AntLabel hint = AntdUiHelper.CreateHintLabel(
                "性能选项对应 Arma 3 服务器启动参数。"
                + "CPU 核心数 / 额外线程 / 最大内存设为 0 表示使用默认值；"
                + "帧率上限影响服务器 Tick 频率，一般 30-60 即可。",
                640);
            hint.Dock = DockStyle.Top;
            hint.Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(8));
            Controls.Add(hint);

            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            enableHtCheckBox = SettingsLayoutHelper.AddRow(layout, "超线程", SettingsLayoutHelper.CreateCheckbox("启用 CPU 超线程 (-enableHT)", true));
            hugepagesCheckBox = SettingsLayoutHelper.AddRow(layout, "大页内存", SettingsLayoutHelper.CreateCheckbox("使用大页内存 (-hugepages)", false));
            loadMissionCheckBox = SettingsLayoutHelper.AddRow(layout, "任务预加载", SettingsLayoutHelper.CreateCheckbox("启动时将任务载入内存 (-loadMissionToMemory)", true));
            disableServerThreadCheckBox = SettingsLayoutHelper.AddRow(layout, "禁用服务端线程", SettingsLayoutHelper.CreateCheckbox("关闭专用服务端线程 (-disableServerThread)", false));
            cpuCountNumeric = SettingsLayoutHelper.AddRow(layout, "CPU 核心数", SettingsLayoutHelper.CreateNumeric(0, 128, 0, 120));
            exThreadsNumeric = SettingsLayoutHelper.AddRow(layout, "额外线程数", SettingsLayoutHelper.CreateNumeric(0, 32, 0, 120));
            maxMemNumeric = SettingsLayoutHelper.AddRow(layout, "最大内存 (MB)", SettingsLayoutHelper.CreateNumeric(0, 65536, 0, 120));
            limitFpsNumeric = SettingsLayoutHelper.AddRow(layout, "帧率上限", SettingsLayoutHelper.CreateNumeric(1, 1000, 60, 120));
            terrainGridNumeric = SettingsLayoutHelper.AddRow(layout, "地形网格", SettingsLayoutHelper.CreateNumeric(1, 50, 30, 120));
            viewDistanceNumeric = SettingsLayoutHelper.AddRow(layout, "视距", SettingsLayoutHelper.CreateNumeric(200, 10000, 1600, 120));

            // 高级选项 (server.cfg class AdvancedOptions + armaUnitsTimeout)
            armaUnitsTimeoutNumeric = SettingsLayoutHelper.AddRow(layout, "Arma Units 超时 (秒)", SettingsLayoutHelper.CreateNumeric(1, 60, 10, 120));
            logObjectNotFoundCheckBox = SettingsLayoutHelper.AddRow(
                layout, "日志·缺失对象", SettingsLayoutHelper.CreateCheckbox("记录缺失对象到 RPT（建议关闭以减少垃圾日志）", false));
            skipDescriptionParsingCheckBox = SettingsLayoutHelper.AddRow(
                layout, "性能·跳过解析", SettingsLayoutHelper.CreateCheckbox("跳过 description.ext 解析（加快任务载入）", false));
            ignoreMissionLoadErrorsCheckBox = SettingsLayoutHelper.AddRow(
                layout, "任务·忽略错误", SettingsLayoutHelper.CreateCheckbox("忽略任务加载错误并强制载入", true));
            queueSizeLogGNumeric = SettingsLayoutHelper.AddRow(
                layout, "消息队列阈值 (字节)", SettingsLayoutHelper.CreateNumeric(0, 99999999, 1000000, 140));

            AntLabel advHint = AntdUiHelper.CreateHintLabel(
                "以上高级选项写入 server.cfg 的 class AdvancedOptions 块和 armaUnitsTimeout 字段。"
                + "可有效减少 RPT 垃圾日志、忽略任务错误强制加载、处理玩家自定义数据。"
                + " ref: ViVi141.141的跨界笔记 https://www.vivi141.com",
                640);
            advHint.Dock = DockStyle.Bottom;
            advHint.Padding = new Padding(0, UiScaleHelper.Scale(8), 0, 0);
            Controls.Add(advHint);

            Controls.Add(SettingsLayoutHelper.CreateScrollHost(layout));
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            if (config == null)
            {
                Enabled = false;
                return;
            }

            Enabled = true;
            enableHtCheckBox.Checked = config.StartupParameters.EnableHT;
            hugepagesCheckBox.Checked = config.StartupParameters.Hugepages;
            loadMissionCheckBox.Checked = config.StartupParameters.LoadMissionToMemory;
            disableServerThreadCheckBox.Checked = config.StartupParameters.DisableServerThread;
            cpuCountNumeric.Value = SettingsLayoutHelper.Clamp(0, 128, config.StartupParameters.CpuCount);
            exThreadsNumeric.Value = SettingsLayoutHelper.Clamp(0, 32, config.StartupParameters.ExThreads);
            maxMemNumeric.Value = SettingsLayoutHelper.Clamp(0, 65536, config.StartupParameters.MaxMem);
            limitFpsNumeric.Value = SettingsLayoutHelper.Clamp(1, 1000, config.StartupParameters.LimitFPS);
            terrainGridNumeric.Value = SettingsLayoutHelper.Clamp(1, 50, config.BasicConfig.TerrainGrid);
            viewDistanceNumeric.Value = SettingsLayoutHelper.Clamp(200, 10000, config.BasicConfig.ViewDistance);

            armaUnitsTimeoutNumeric.Value = SettingsLayoutHelper.Clamp(1, 60, config.ServerConfig.ArmaUnitsTimeout);

            AdvancedOptions adv = config.ServerConfig.AdvancedOptions;
            if (adv != null)
            {
                logObjectNotFoundCheckBox.Checked = adv.LogObjectNotFound;
                skipDescriptionParsingCheckBox.Checked = adv.SkipDescriptionParsing;
                ignoreMissionLoadErrorsCheckBox.Checked = adv.ignoreMissionLoadErrors;
                queueSizeLogGNumeric.Value = SettingsLayoutHelper.Clamp(0, 99999999, adv.queueSizeLogG);
            }
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            boundConfig.StartupParameters.EnableHT = enableHtCheckBox.Checked;
            boundConfig.StartupParameters.Hugepages = hugepagesCheckBox.Checked;
            boundConfig.StartupParameters.LoadMissionToMemory = loadMissionCheckBox.Checked;
            boundConfig.StartupParameters.DisableServerThread = disableServerThreadCheckBox.Checked;
            boundConfig.StartupParameters.CpuCount = (int)cpuCountNumeric.Value;
            boundConfig.StartupParameters.ExThreads = (int)exThreadsNumeric.Value;
            boundConfig.StartupParameters.MaxMem = (int)maxMemNumeric.Value;
            boundConfig.StartupParameters.LimitFPS = (int)limitFpsNumeric.Value;
            boundConfig.BasicConfig.TerrainGrid = (int)terrainGridNumeric.Value;
            boundConfig.BasicConfig.ViewDistance = (int)viewDistanceNumeric.Value;

            boundConfig.ServerConfig.ArmaUnitsTimeout = (int)armaUnitsTimeoutNumeric.Value;

            AdvancedOptions adv = boundConfig.ServerConfig.AdvancedOptions;
            if (adv == null)
            {
                adv = new AdvancedOptions();
                boundConfig.ServerConfig.AdvancedOptions = adv;
            }

            adv.LogObjectNotFound = logObjectNotFoundCheckBox.Checked;
            adv.SkipDescriptionParsing = skipDescriptionParsingCheckBox.Checked;
            adv.ignoreMissionLoadErrors = ignoreMissionLoadErrorsCheckBox.Checked;
            adv.queueSizeLogG = (int)queueSizeLogGNumeric.Value;
        }
    }
}

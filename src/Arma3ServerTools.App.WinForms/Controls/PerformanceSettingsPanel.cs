using System.Windows.Forms;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class PerformanceSettingsPanel : UserControl, IServerSettingsPanel
    {
        private readonly CheckBox enableHtCheckBox;
        private readonly CheckBox hugepagesCheckBox;
        private readonly CheckBox loadMissionCheckBox;
        private readonly CheckBox disableServerThreadCheckBox;
        private readonly NumericUpDown cpuCountNumeric;
        private readonly NumericUpDown exThreadsNumeric;
        private readonly NumericUpDown maxMemNumeric;
        private readonly NumericUpDown limitFpsNumeric;
        private readonly NumericUpDown terrainGridNumeric;
        private readonly NumericUpDown viewDistanceNumeric;

        private ArmaServerConfig boundConfig;

        public PerformanceSettingsPanel()
        {
            Dock = DockStyle.Fill;
            var layout = SettingsLayoutHelper.CreateFormLayout(160);
            enableHtCheckBox = SettingsLayoutHelper.AddRow(layout, "EnableHT", new CheckBox { Text = "-enableHT", AutoSize = true, Checked = true });
            hugepagesCheckBox = SettingsLayoutHelper.AddRow(layout, "Hugepages", new CheckBox { Text = "-hugepages", AutoSize = true });
            loadMissionCheckBox = SettingsLayoutHelper.AddRow(layout, "LoadMission", new CheckBox { Text = "-loadMissionToMemory", AutoSize = true, Checked = true });
            disableServerThreadCheckBox = SettingsLayoutHelper.AddRow(layout, "DisableServerThread", new CheckBox { Text = "-disableServerThread", AutoSize = true });
            cpuCountNumeric = SettingsLayoutHelper.AddRow(layout, "CpuCount", SettingsLayoutHelper.CreateNumeric(0, 128, 0, 120));
            exThreadsNumeric = SettingsLayoutHelper.AddRow(layout, "ExThreads", SettingsLayoutHelper.CreateNumeric(0, 32, 0, 120));
            maxMemNumeric = SettingsLayoutHelper.AddRow(layout, "MaxMem (MB)", SettingsLayoutHelper.CreateNumeric(0, 65536, 0, 120));
            limitFpsNumeric = SettingsLayoutHelper.AddRow(layout, "LimitFPS", SettingsLayoutHelper.CreateNumeric(1, 1000, 1000, 120));
            terrainGridNumeric = SettingsLayoutHelper.AddRow(layout, "TerrainGrid", SettingsLayoutHelper.CreateNumeric(1, 50, 30, 120));
            viewDistanceNumeric = SettingsLayoutHelper.AddRow(layout, "ViewDistance", SettingsLayoutHelper.CreateNumeric(200, 10000, 1600, 120));
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
        }
    }
}

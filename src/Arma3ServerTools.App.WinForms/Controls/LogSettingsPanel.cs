using System.Windows.Forms;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class LogSettingsPanel : UserControl, IServerSettingsPanel
    {
        private readonly CheckBox noLogsCheckBox;
        private readonly CheckBox netlogCheckBox;
        private readonly TextBox logFileTextBox;
        private readonly ComboBox timeStampFormatCombo;
        private readonly NumericUpDown callExtReportLimitNumeric;

        private ArmaServerConfig boundConfig;

        public LogSettingsPanel()
        {
            Dock = DockStyle.Fill;
            var layout = SettingsLayoutHelper.CreateFormLayout(160);
            noLogsCheckBox = SettingsLayoutHelper.AddRow(layout, "NoLogs", new CheckBox { Text = "-noLogs", AutoSize = true });
            netlogCheckBox = SettingsLayoutHelper.AddRow(layout, "Netlog", new CheckBox { Text = "-netlog", AutoSize = true });
            logFileTextBox = SettingsLayoutHelper.AddRow(layout, "LogFile", new TextBox { Dock = DockStyle.Fill, Text = "server_console.log" });
            timeStampFormatCombo = SettingsLayoutHelper.AddRow(layout, "TimeStampFormat", new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Width = 200,
            });
            timeStampFormatCombo.Items.AddRange(new object[] { "none", "short", "full" });
            callExtReportLimitNumeric = SettingsLayoutHelper.AddRow(layout, "CallExtReportLimit", SettingsLayoutHelper.CreateNumeric(1, 60000, 1000, 120));
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
            noLogsCheckBox.Checked = config.StartupParameters.NoLogs;
            netlogCheckBox.Checked = config.StartupParameters.Netlog;
            logFileTextBox.Text = config.ServerConfig.LogFile ?? "server_console.log";
            if (config.ServerConfig.TimeStampFormat >= 0 && config.ServerConfig.TimeStampFormat < timeStampFormatCombo.Items.Count)
            {
                timeStampFormatCombo.SelectedIndex = config.ServerConfig.TimeStampFormat;
            }
            else
            {
                timeStampFormatCombo.SelectedIndex = 1;
            }

            callExtReportLimitNumeric.Value = SettingsLayoutHelper.Clamp(1, 60000, config.ServerConfig.CallExtReportLimit);
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            boundConfig.StartupParameters.NoLogs = noLogsCheckBox.Checked;
            boundConfig.StartupParameters.Netlog = netlogCheckBox.Checked;
            boundConfig.ServerConfig.LogFile = logFileTextBox.Text.Trim();
            boundConfig.ServerConfig.TimeStampFormat = timeStampFormatCombo.SelectedIndex;
            boundConfig.ServerConfig.CallExtReportLimit = (int)callExtReportLimitNumeric.Value;
        }
    }
}

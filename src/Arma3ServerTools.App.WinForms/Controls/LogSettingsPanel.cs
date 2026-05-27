using System.Windows.Forms;
using Arma3ServerTools.Core.Models;
using AntCheckbox = AntdUI.Checkbox;
using AntInput = AntdUI.Input;
using AntInputNumber = AntdUI.InputNumber;
using AntSelect = AntdUI.Select;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class LogSettingsPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntCheckbox noLogsCheckBox;
        private readonly AntCheckbox netlogCheckBox;
        private readonly AntInput logFileTextBox;
        private readonly AntSelect timeStampFormatCombo;
        private readonly AntInputNumber callExtReportLimitNumeric;

        private ArmaServerConfig boundConfig;

        public LogSettingsPanel()
        {
            Dock = DockStyle.Fill;
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            noLogsCheckBox = SettingsLayoutHelper.AddRow(layout, "禁用日志", SettingsLayoutHelper.CreateCheckbox("不写入 RPT 日志 (-noLogs)", false));
            netlogCheckBox = SettingsLayoutHelper.AddRow(layout, "网络日志", SettingsLayoutHelper.CreateCheckbox("记录网络流量 (-netlog)", false));
            logFileTextBox = SettingsLayoutHelper.AddRow(layout, "控制台日志文件", SettingsLayoutHelper.CreateInput(true));
            logFileTextBox.Text = "server_console.log";
            timeStampFormatCombo = SettingsLayoutHelper.AddRow(
                layout,
                "时间戳格式",
                SettingsLayoutHelper.CreateSelect(200, "无", "简短", "完整"));
            callExtReportLimitNumeric = SettingsLayoutHelper.AddRow(
                layout,
                "扩展调用报告上限",
                SettingsLayoutHelper.CreateNumeric(1, 60000, 1000, 120));
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
            if (config.ServerConfig.TimeStampFormat >= 0 && config.ServerConfig.TimeStampFormat < 3)
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
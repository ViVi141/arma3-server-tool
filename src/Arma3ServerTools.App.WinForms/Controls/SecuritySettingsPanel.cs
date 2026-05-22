using System;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class SecuritySettingsPanel : UserControl, IServerSettingsPanel
    {
        private CheckBox battlEyeCheckBox;
        private CheckBox verifySignaturesCheckBox;
        private CheckBox kickDuplicateCheckBox;
        private CheckBox filePatchingCheckBox;
        private ComboBox allowedFilePatchingCombo;
        private TextBox filePatchingExceptionsTextBox;
        private TextBox serverCommandPasswordTextBox;
        private TextBox passwordAdminTextBox;
        private TextBox rconPasswordTextBox;
        private NumericUpDown rconPortNumeric;
        private NumericUpDown beMaxPingNumeric;
        private TextBox adminsTextBox;
        private TextBox onHackedDataTextBox;
        private TextBox onDifferentDataTextBox;
        private TextBox onUnsignedDataTextBox;
        private TextBox allowedLoadFileTextBox;
        private TextBox allowedPreprocessTextBox;
        private TextBox allowedHtmlLoadTextBox;
        private TextBox allowedHtmlUriTextBox;
        private NumericUpDown maxCreateVehicleCount;
        private NumericUpDown maxCreateVehicleSeconds;
        private NumericUpDown maxSetPosCount;
        private NumericUpDown maxSetPosSeconds;

        private ArmaServerConfig boundConfig;

        public SecuritySettingsPanel()
        {
            Dock = DockStyle.Fill;
            var root = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1 };
            root.Controls.Add(WrapGroup("基础安全", BuildBasicSecurity()));
            root.Controls.Add(WrapGroup("BattlEye / RCon", BuildBeSection()));
            root.Controls.Add(WrapGroup("BattlEye 限流 (部分)", BuildBeLimits()));
            root.Controls.Add(WrapGroup("脚本事件 (明文，保存时 Base64)", BuildScriptSection()));
            root.Controls.Add(WrapGroup("扩展白名单 (每行一项)", BuildWhitelistSection()));
            Controls.Add(SettingsLayoutHelper.CreateScrollHost(root));
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
            battlEyeCheckBox.Checked = config.ServerConfig.BattlEye;
            verifySignaturesCheckBox.Checked = config.ServerConfig.VerifySignatures;
            kickDuplicateCheckBox.Checked = config.ServerConfig.Kickduplicate == 0;
            filePatchingCheckBox.Checked = config.StartupParameters.FilePatching;
            allowedFilePatchingCombo.SelectedIndex = (int)SettingsLayoutHelper.Clamp(0, 2, config.ServerConfig.AllowedFilePatching);
            filePatchingExceptionsTextBox.Text = JoinLines(config.ServerConfig.FilePatchingExceptions);
            serverCommandPasswordTextBox.Text = config.ServerConfig.ServerCommandPassword ?? string.Empty;
            passwordAdminTextBox.Text = config.ServerConfig.PasswordAdmin ?? string.Empty;
            rconPasswordTextBox.Text = config.BattlEyeConfig.RConPassword ?? string.Empty;
            rconPortNumeric.Value = SettingsLayoutHelper.Clamp(1024, 65535, config.BattlEyeConfig.RConPort);
            beMaxPingNumeric.Value = SettingsLayoutHelper.Clamp(50, 2000, config.BattlEyeConfig.MaxPing);
            adminsTextBox.Text = JoinLines(config.ServerConfig.Admins);
            onHackedDataTextBox.Text = DecodeBase64(config.ServerConfig.onHackedData);
            onDifferentDataTextBox.Text = DecodeBase64(config.ServerConfig.onDifferentData);
            onUnsignedDataTextBox.Text = DecodeBase64(config.ServerConfig.onUnsignedData);
            allowedLoadFileTextBox.Text = JoinLines(config.ServerConfig.AllowedLoadFileExtensions);
            allowedPreprocessTextBox.Text = JoinLines(config.ServerConfig.AllowedPreprocessFileExtensions);
            allowedHtmlLoadTextBox.Text = JoinLines(config.ServerConfig.AllowedHTMLLoadExtensions);
            allowedHtmlUriTextBox.Text = JoinLines(config.ServerConfig.AllowedHTMLLoadURIs);
            maxCreateVehicleCount.Value = config.BattlEyeConfig.MaxCreateVehiclePerInterval.MaxNumbe;
            maxCreateVehicleSeconds.Value = config.BattlEyeConfig.MaxCreateVehiclePerInterval.Seconds;
            maxSetPosCount.Value = config.BattlEyeConfig.MaxSetPosPerInterval.MaxNumbe;
            maxSetPosSeconds.Value = config.BattlEyeConfig.MaxSetPosPerInterval.Seconds;
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            boundConfig.ServerConfig.BattlEye = battlEyeCheckBox.Checked;
            boundConfig.ServerConfig.VerifySignatures = verifySignaturesCheckBox.Checked;
            if (kickDuplicateCheckBox.Checked)
            {
                boundConfig.ServerConfig.Kickduplicate = 0;
            }
            else
            {
                boundConfig.ServerConfig.Kickduplicate = 1;
            }

            boundConfig.StartupParameters.FilePatching = filePatchingCheckBox.Checked;
            boundConfig.ServerConfig.AllowedFilePatching = allowedFilePatchingCombo.SelectedIndex;
            boundConfig.ServerConfig.FilePatchingExceptions = SplitLines(filePatchingExceptionsTextBox.Text);
            boundConfig.ServerConfig.ServerCommandPassword = serverCommandPasswordTextBox.Text.Trim();
            boundConfig.ServerConfig.PasswordAdmin = passwordAdminTextBox.Text.Trim();
            boundConfig.BattlEyeConfig.RConPassword = rconPasswordTextBox.Text;
            boundConfig.BattlEyeConfig.RConPort = (int)rconPortNumeric.Value;
            boundConfig.BattlEyeConfig.MaxPing = (int)beMaxPingNumeric.Value;
            boundConfig.ServerConfig.Admins = SplitLines(adminsTextBox.Text);
            boundConfig.ServerConfig.onHackedData = EncodeBase64(onHackedDataTextBox.Text);
            boundConfig.ServerConfig.onDifferentData = EncodeBase64(onDifferentDataTextBox.Text);
            boundConfig.ServerConfig.onUnsignedData = EncodeBase64(onUnsignedDataTextBox.Text);
            boundConfig.ServerConfig.AllowedLoadFileExtensions = SplitLines(allowedLoadFileTextBox.Text);
            boundConfig.ServerConfig.AllowedPreprocessFileExtensions = SplitLines(allowedPreprocessTextBox.Text);
            boundConfig.ServerConfig.AllowedHTMLLoadExtensions = SplitLines(allowedHtmlLoadTextBox.Text);
            boundConfig.ServerConfig.AllowedHTMLLoadURIs = SplitLines(allowedHtmlUriTextBox.Text);
            boundConfig.BattlEyeConfig.MaxCreateVehiclePerInterval.MaxNumbe = (int)maxCreateVehicleCount.Value;
            boundConfig.BattlEyeConfig.MaxCreateVehiclePerInterval.Seconds = (int)maxCreateVehicleSeconds.Value;
            boundConfig.BattlEyeConfig.MaxSetPosPerInterval.MaxNumbe = (int)maxSetPosCount.Value;
            boundConfig.BattlEyeConfig.MaxSetPosPerInterval.Seconds = (int)maxSetPosSeconds.Value;
        }

        private Control BuildBasicSecurity()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(160);
            battlEyeCheckBox = SettingsLayoutHelper.AddRow(layout, "BattlEye", new CheckBox { Text = "启用 BattlEye", AutoSize = true, Checked = true });
            verifySignaturesCheckBox = SettingsLayoutHelper.AddRow(layout, "签名验证", new CheckBox { Text = "VerifySignatures", AutoSize = true, Checked = true });
            kickDuplicateCheckBox = SettingsLayoutHelper.AddRow(layout, "重复 ID", new CheckBox { Text = "允许重复玩家 ID", AutoSize = true });
            filePatchingCheckBox = SettingsLayoutHelper.AddRow(layout, "FilePatching", new CheckBox { Text = "-filePatching", AutoSize = true });
            allowedFilePatchingCombo = SettingsLayoutHelper.AddRow(layout, "allowedFilePatching", new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 200 });
            allowedFilePatchingCombo.Items.AddRange(new object[] { "0 - 禁用", "1 - 仅 Headless", "2 - 全部客户端" });
            filePatchingExceptionsTextBox = SettingsLayoutHelper.AddRow(layout, "补丁例外 UID", CreateMultilineTextBox());
            return layout;
        }

        private Control BuildBeSection()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(160);
            serverCommandPasswordTextBox = SettingsLayoutHelper.AddRow(layout, "命令密码", new TextBox { Dock = DockStyle.Fill });
            passwordAdminTextBox = SettingsLayoutHelper.AddRow(layout, "管理员密码", new TextBox { Dock = DockStyle.Fill });
            rconPasswordTextBox = SettingsLayoutHelper.AddRow(layout, "RCon 密码", new TextBox { Dock = DockStyle.Fill });
            rconPortNumeric = SettingsLayoutHelper.AddRow(layout, "RCon 端口", SettingsLayoutHelper.CreateNumeric(1024, 65535, 2310, 120));
            beMaxPingNumeric = SettingsLayoutHelper.AddRow(layout, "BE MaxPing", SettingsLayoutHelper.CreateNumeric(50, 2000, 500, 120));
            adminsTextBox = SettingsLayoutHelper.AddRow(layout, "管理员 UID", CreateMultilineTextBox());
            return layout;
        }

        private Control BuildBeLimits()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(180);
            maxCreateVehicleCount = SettingsLayoutHelper.AddRow(layout, "CreateVehicle 次数", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            maxCreateVehicleSeconds = SettingsLayoutHelper.AddRow(layout, "CreateVehicle 秒数", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            maxSetPosCount = SettingsLayoutHelper.AddRow(layout, "SetPos 次数", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            maxSetPosSeconds = SettingsLayoutHelper.AddRow(layout, "SetPos 秒数", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            return layout;
        }

        private Control BuildScriptSection()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(160);
            onHackedDataTextBox = SettingsLayoutHelper.AddRow(layout, "onHackedData", CreateMultilineTextBox());
            onDifferentDataTextBox = SettingsLayoutHelper.AddRow(layout, "onDifferentData", CreateMultilineTextBox());
            onUnsignedDataTextBox = SettingsLayoutHelper.AddRow(layout, "onUnsignedData", CreateMultilineTextBox());
            return layout;
        }

        private Control BuildWhitelistSection()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(180);
            allowedLoadFileTextBox = SettingsLayoutHelper.AddRow(layout, "LoadFile", CreateMultilineTextBox());
            allowedPreprocessTextBox = SettingsLayoutHelper.AddRow(layout, "Preprocess", CreateMultilineTextBox());
            allowedHtmlLoadTextBox = SettingsLayoutHelper.AddRow(layout, "HTML Load", CreateMultilineTextBox());
            allowedHtmlUriTextBox = SettingsLayoutHelper.AddRow(layout, "HTML URI", CreateMultilineTextBox());
            return layout;
        }

        private static GroupBox WrapGroup(string title, Control content)
        {
            content.Dock = DockStyle.Top;
            return new GroupBox
            {
                Text = title,
                Dock = DockStyle.Top,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(8),
                Controls = { content },
            };
        }

        private static TextBox CreateMultilineTextBox()
        {
            return new TextBox
            {
                Multiline = true,
                Height = 70,
                Dock = DockStyle.Fill,
                ScrollBars = ScrollBars.Vertical,
            };
        }

        private static string JoinLines(System.Collections.Generic.IEnumerable<string> lines)
        {
            if (lines == null)
            {
                return string.Empty;
            }

            return string.Join(Environment.NewLine, lines);
        }

        private static System.Collections.Generic.List<string> SplitLines(string text)
        {
            return text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(line => line.Trim())
                .Where(line => !string.IsNullOrEmpty(line))
                .ToList();
        }

        private static string DecodeBase64(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            try
            {
                return Encoding.Default.GetString(Convert.FromBase64String(value));
            }
            catch
            {
                return string.Empty;
            }
        }

        private static string EncodeBase64(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            return Convert.ToBase64String(Encoding.Default.GetBytes(value));
        }
    }
}

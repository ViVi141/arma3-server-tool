using System;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using Arma3ServerTools.Core.Models;
using AntCheckbox = AntdUI.Checkbox;
using AntInput = AntdUI.Input;
using AntInputNumber = AntdUI.InputNumber;
using AntSelect = AntdUI.Select;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class SecuritySettingsPanel : UserControl, IServerSettingsPanel
    {
        private AntCheckbox battlEyeCheckBox;
        private AntCheckbox verifySignaturesCheckBox;
        private AntCheckbox kickDuplicateCheckBox;
        private AntCheckbox filePatchingCheckBox;
        private AntSelect allowedFilePatchingCombo;
        private AntInput filePatchingExceptionsTextBox;
        private AntInput serverCommandPasswordTextBox;
        private AntInput passwordAdminTextBox;
        private AntInput rconPasswordTextBox;
        private AntInputNumber rconPortNumeric;
        private AntInputNumber beMaxPingNumeric;
        private AntInput adminsTextBox;
        private AntInput onHackedDataTextBox;
        private AntInput onDifferentDataTextBox;
        private AntInput onUnsignedDataTextBox;
        private AntInput allowedLoadFileTextBox;
        private AntInput allowedPreprocessTextBox;
        private AntInput allowedHtmlLoadTextBox;
        private AntInput allowedHtmlUriTextBox;
        private AntInputNumber maxCreateVehicleCount;
        private AntInputNumber maxCreateVehicleSeconds;
        private AntInputNumber maxSetPosCount;
        private AntInputNumber maxSetPosSeconds;

        private ArmaServerConfig boundConfig;

        public SecuritySettingsPanel()
        {
            Dock = DockStyle.Fill;
            var root = SettingsLayoutHelper.CreateSectionsStack();
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("基础安全", BuildBasicSecurity()));
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("BattlEye / RCon", BuildBeSection()));
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("BattlEye 限流 (部分)", BuildBeLimits()));
            SettingsLayoutHelper.AddStackSection(
                root,
                SettingsLayoutHelper.CreateGroup("脚本事件 (明文，保存时 Base64)", BuildScriptSection()));
            SettingsLayoutHelper.AddStackSection(
                root,
                SettingsLayoutHelper.CreateGroup("扩展白名单 (每行一项)", BuildWhitelistSection()));
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
            battlEyeCheckBox = SettingsLayoutHelper.AddRow(
                layout, "BattlEye", SettingsLayoutHelper.CreateCheckbox("启用 BattlEye", true));
            verifySignaturesCheckBox = SettingsLayoutHelper.AddRow(
                layout, "签名验证", SettingsLayoutHelper.CreateCheckbox("VerifySignatures", true));
            kickDuplicateCheckBox = SettingsLayoutHelper.AddRow(
                layout, "重复 ID", SettingsLayoutHelper.CreateCheckbox("允许重复玩家 ID", false));
            filePatchingCheckBox = SettingsLayoutHelper.AddRow(
                layout, "FilePatching", SettingsLayoutHelper.CreateCheckbox("-filePatching", false));
            allowedFilePatchingCombo = SettingsLayoutHelper.AddRow(
                layout,
                "allowedFilePatching",
                SettingsLayoutHelper.CreateSelect(200, "0 - 禁用", "1 - 仅 Headless", "2 - 全部客户端"));
            filePatchingExceptionsTextBox = SettingsLayoutHelper.AddRow(
                layout, "补丁例外 UID", SettingsLayoutHelper.CreateMultilineInput(70));
            return layout;
        }

        private Control BuildBeSection()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(160);
            serverCommandPasswordTextBox = SettingsLayoutHelper.AddRow(
                layout, "命令密码", SettingsLayoutHelper.CreatePasswordInput());
            passwordAdminTextBox = SettingsLayoutHelper.AddRow(
                layout, "管理员密码", SettingsLayoutHelper.CreatePasswordInput());
            rconPasswordTextBox = SettingsLayoutHelper.AddRow(
                layout, "RCon 密码", SettingsLayoutHelper.CreatePasswordInput());
            rconPortNumeric = SettingsLayoutHelper.AddRow(
                layout, "RCon 端口", SettingsLayoutHelper.CreateNumeric(1024, 65535, 2310, 120));
            beMaxPingNumeric = SettingsLayoutHelper.AddRow(
                layout, "BE MaxPing", SettingsLayoutHelper.CreateNumeric(50, 2000, 500, 120));
            adminsTextBox = SettingsLayoutHelper.AddRow(
                layout, "管理员 UID", SettingsLayoutHelper.CreateMultilineInput(70));
            return layout;
        }

        private Control BuildBeLimits()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(180);
            maxCreateVehicleCount = SettingsLayoutHelper.AddRow(
                layout, "CreateVehicle 次数", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            maxCreateVehicleSeconds = SettingsLayoutHelper.AddRow(
                layout, "CreateVehicle 秒数", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            maxSetPosCount = SettingsLayoutHelper.AddRow(
                layout, "SetPos 次数", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            maxSetPosSeconds = SettingsLayoutHelper.AddRow(
                layout, "SetPos 秒数", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            return layout;
        }

        private Control BuildScriptSection()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(160);
            onHackedDataTextBox = SettingsLayoutHelper.AddRow(
                layout, "onHackedData", SettingsLayoutHelper.CreateMultilineInput(70));
            onDifferentDataTextBox = SettingsLayoutHelper.AddRow(
                layout, "onDifferentData", SettingsLayoutHelper.CreateMultilineInput(70));
            onUnsignedDataTextBox = SettingsLayoutHelper.AddRow(
                layout, "onUnsignedData", SettingsLayoutHelper.CreateMultilineInput(70));
            return layout;
        }

        private Control BuildWhitelistSection()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(180);
            allowedLoadFileTextBox = SettingsLayoutHelper.AddRow(
                layout, "LoadFile", SettingsLayoutHelper.CreateMultilineInput(70));
            allowedPreprocessTextBox = SettingsLayoutHelper.AddRow(
                layout, "Preprocess", SettingsLayoutHelper.CreateMultilineInput(70));
            allowedHtmlLoadTextBox = SettingsLayoutHelper.AddRow(
                layout, "HTML Load", SettingsLayoutHelper.CreateMultilineInput(70));
            allowedHtmlUriTextBox = SettingsLayoutHelper.AddRow(
                layout, "HTML URI", SettingsLayoutHelper.CreateMultilineInput(70));
            return layout;
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

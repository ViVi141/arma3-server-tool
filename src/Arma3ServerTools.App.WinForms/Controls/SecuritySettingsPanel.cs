using System;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Core.Models;
using AntCheckbox = AntdUI.Checkbox;
using AntInput = AntdUI.Input;
using AntLabel = AntdUI.Label;
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
        private AntInput rconHostTextBox;
        private AntInputNumber rconPortNumeric;
        private AntInputNumber beMaxPingNumeric;
        private AntInput adminsTextBox;
        private AntInput doubleIdDetectedTextBox;
        private AntInput onUserConnectedTextBox;
        private AntInput onUserDisconnectedTextBox;
        private AntInput onUserKickedTextBox;
        private AntInput regularCheckTextBox;
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
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("BattlEye / 远程控制", BuildBeSection()));
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("BattlEye 限流 (部分)", BuildBeLimits()));
            AntLabel scriptHint = AntdUiHelper.CreateHintLabel(
                "以下脚本事件字段保存时会自动进行 Base64 编码。请直接输入 SQF 脚本代码，"
                + "不要粘贴已编码的字符串（否则会被二次编码导致数据损坏）。",
                640);
            SettingsLayoutHelper.AddStackSection(root, scriptHint);
            SettingsLayoutHelper.AddStackSection(
                root,
                SettingsLayoutHelper.CreateGroup(UiLabels.ScriptEventsGroup, BuildScriptSection()));
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
            // Kickduplicate: 字段名与 UI 标签语义相反 → 值 0=允许(Checked=true)，值 1=踢出(Checked=false)
            kickDuplicateCheckBox.Checked = config.ServerConfig.Kickduplicate == 0;
            filePatchingCheckBox.Checked = config.StartupParameters.FilePatching;
            allowedFilePatchingCombo.SelectedIndex = (int)SettingsLayoutHelper.Clamp(0, 2, config.ServerConfig.AllowedFilePatching);
            filePatchingExceptionsTextBox.Text = JoinLines(config.ServerConfig.FilePatchingExceptions);
            serverCommandPasswordTextBox.Text = config.ServerConfig.ServerCommandPassword ?? string.Empty;
            passwordAdminTextBox.Text = config.ServerConfig.PasswordAdmin ?? string.Empty;
            rconPasswordTextBox.Text = config.BattlEyeConfig.RConPassword ?? string.Empty;
            string rconHost = config.BattlEyeConfig.RConHost;
            if (string.IsNullOrWhiteSpace(rconHost))
            {
                rconHost = "127.0.0.1";
            }

            rconHostTextBox.Text = rconHost;
            rconPortNumeric.Value = SettingsLayoutHelper.Clamp(1024, 65535, config.BattlEyeConfig.RConPort);
            beMaxPingNumeric.Value = SettingsLayoutHelper.Clamp(50, 2000, config.BattlEyeConfig.MaxPing);
            adminsTextBox.Text = JoinLines(config.ServerConfig.Admins);
            doubleIdDetectedTextBox.Text = Base64Helper.Decode(config.ServerConfig.DoubleIdDetected);
            onUserConnectedTextBox.Text = Base64Helper.Decode(config.ServerConfig.onUserConnected);
            onUserDisconnectedTextBox.Text = Base64Helper.Decode(config.ServerConfig.onUserDisconnected);
            onUserKickedTextBox.Text = Base64Helper.Decode(config.ServerConfig.onUserKicked);
            regularCheckTextBox.Text = Base64Helper.Decode(config.ServerConfig.RegularCheck);
            onHackedDataTextBox.Text = Base64Helper.Decode(config.ServerConfig.onHackedData);
            onDifferentDataTextBox.Text = Base64Helper.Decode(config.ServerConfig.onDifferentData);
            onUnsignedDataTextBox.Text = Base64Helper.Decode(config.ServerConfig.onUnsignedData);
            allowedLoadFileTextBox.Text = JoinLines(config.ServerConfig.AllowedLoadFileExtensions);
            allowedPreprocessTextBox.Text = JoinLines(config.ServerConfig.AllowedPreprocessFileExtensions);
            allowedHtmlLoadTextBox.Text = JoinLines(config.ServerConfig.AllowedHTMLLoadExtensions);
            allowedHtmlUriTextBox.Text = JoinLines(config.ServerConfig.AllowedHTMLLoadURIs);
            maxCreateVehicleCount.Value = config.BattlEyeConfig.MaxCreateVehiclePerInterval.MaxNumber;
            maxCreateVehicleSeconds.Value = config.BattlEyeConfig.MaxCreateVehiclePerInterval.Seconds;
            maxSetPosCount.Value = config.BattlEyeConfig.MaxSetPosPerInterval.MaxNumber;
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
            // Kickduplicate: UI 标签"允许同一 ID 重复进入"与字段名语义相反，勾选→0=允许，未勾选→1=踢出
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
            boundConfig.BattlEyeConfig.RConHost = rconHostTextBox.Text.Trim();
            boundConfig.BattlEyeConfig.RConPort = (int)rconPortNumeric.Value;
            boundConfig.BattlEyeConfig.MaxPing = (int)beMaxPingNumeric.Value;
            boundConfig.ServerConfig.Admins = SplitLines(adminsTextBox.Text);
            boundConfig.ServerConfig.DoubleIdDetected = Base64Helper.Encode(doubleIdDetectedTextBox.Text);
            boundConfig.ServerConfig.onUserConnected = Base64Helper.Encode(onUserConnectedTextBox.Text);
            boundConfig.ServerConfig.onUserDisconnected = Base64Helper.Encode(onUserDisconnectedTextBox.Text);
            boundConfig.ServerConfig.onUserKicked = Base64Helper.Encode(onUserKickedTextBox.Text);
            boundConfig.ServerConfig.RegularCheck = Base64Helper.Encode(regularCheckTextBox.Text);
            boundConfig.ServerConfig.onHackedData = Base64Helper.Encode(onHackedDataTextBox.Text);
            boundConfig.ServerConfig.onDifferentData = Base64Helper.Encode(onDifferentDataTextBox.Text);
            boundConfig.ServerConfig.onUnsignedData = Base64Helper.Encode(onUnsignedDataTextBox.Text);
            boundConfig.ServerConfig.AllowedLoadFileExtensions = SplitLines(allowedLoadFileTextBox.Text);
            boundConfig.ServerConfig.AllowedPreprocessFileExtensions = SplitLines(allowedPreprocessTextBox.Text);
            boundConfig.ServerConfig.AllowedHTMLLoadExtensions = SplitLines(allowedHtmlLoadTextBox.Text);
            boundConfig.ServerConfig.AllowedHTMLLoadURIs = SplitLines(allowedHtmlUriTextBox.Text);
            boundConfig.BattlEyeConfig.MaxCreateVehiclePerInterval.MaxNumber = (int)maxCreateVehicleCount.Value;
            boundConfig.BattlEyeConfig.MaxCreateVehiclePerInterval.Seconds = (int)maxCreateVehicleSeconds.Value;
            boundConfig.BattlEyeConfig.MaxSetPosPerInterval.MaxNumber = (int)maxSetPosCount.Value;
            boundConfig.BattlEyeConfig.MaxSetPosPerInterval.Seconds = (int)maxSetPosSeconds.Value;
        }

        private Control BuildBasicSecurity()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            battlEyeCheckBox = SettingsLayoutHelper.AddRow(
                layout, "BattlEye 反作弊", SettingsLayoutHelper.CreateCheckbox("启用 BattlEye", true));
            verifySignaturesCheckBox = SettingsLayoutHelper.AddRow(
                layout, "模组签名", SettingsLayoutHelper.CreateCheckbox("校验模组数字签名", true));
            kickDuplicateCheckBox = SettingsLayoutHelper.AddRow(
                layout, "重复 Steam ID", SettingsLayoutHelper.CreateCheckbox("允许同一 ID 重复进入", false));
            filePatchingCheckBox = SettingsLayoutHelper.AddRow(
                layout, "文件补丁", SettingsLayoutHelper.CreateCheckbox("允许客户端文件补丁 (-filePatching)", false));
            allowedFilePatchingCombo = SettingsLayoutHelper.AddRow(
                layout,
                "补丁权限",
                SettingsLayoutHelper.CreateSelect(200, "0 - 完全禁用", "1 - 仅无头客户端", "2 - 全部客户端"));
            filePatchingExceptionsTextBox = SettingsLayoutHelper.AddRow(
                layout, "补丁白名单 UID", SettingsLayoutHelper.CreateMultilineInput(70));
            return layout;
        }

        private Control BuildBeSection()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            Control cmdPwdContainer = SettingsLayoutHelper.CreatePasswordInputWithToggle(out AntInput cmdPwdInput);
            serverCommandPasswordTextBox = cmdPwdInput;
            SettingsLayoutHelper.AddRow(layout, "命令密码", cmdPwdContainer);
            Control admPwdContainer = SettingsLayoutHelper.CreatePasswordInputWithToggle(out AntInput admPwdInput);
            passwordAdminTextBox = admPwdInput;
            SettingsLayoutHelper.AddRow(layout, "管理员密码", admPwdContainer);
            Control rconPwdContainer = SettingsLayoutHelper.CreatePasswordInputWithToggle(out AntInput rconPwdInput);
            rconPasswordTextBox = rconPwdInput;
            SettingsLayoutHelper.AddRow(layout, "远程控制密码", rconPwdContainer);
            rconHostTextBox = SettingsLayoutHelper.AddRow(
                layout, "远程控制地址", SettingsLayoutHelper.CreateInput(true));
            rconHostTextBox.Text = "127.0.0.1";
            rconPortNumeric = SettingsLayoutHelper.AddRow(
                layout, "远程控制端口", SettingsLayoutHelper.CreateNumeric(1024, 65535, 2310, 120));
            beMaxPingNumeric = SettingsLayoutHelper.AddRow(
                layout, "BattlEye 最大延迟", SettingsLayoutHelper.CreateNumeric(50, 2000, 500, 120));
            adminsTextBox = SettingsLayoutHelper.AddRow(
                layout, "管理员 UID", SettingsLayoutHelper.CreateMultilineInput(70));
            return layout;
        }

        private Control BuildBeLimits()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            maxCreateVehicleCount = SettingsLayoutHelper.AddRow(
                layout, "CreateVehicle 次数上限", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            maxCreateVehicleSeconds = SettingsLayoutHelper.AddRow(
                layout, "CreateVehicle 统计窗口 (秒)", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            maxSetPosCount = SettingsLayoutHelper.AddRow(
                layout, "SetPos 次数上限", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            maxSetPosSeconds = SettingsLayoutHelper.AddRow(
                layout, "SetPos 统计窗口 (秒)", SettingsLayoutHelper.CreateNumeric(0, 9999, 0, 120));
            return layout;
        }

        private Control BuildScriptSection()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            doubleIdDetectedTextBox = SettingsLayoutHelper.AddRow(
                layout, "检测到重复 ID", SettingsLayoutHelper.CreateMultilineInput(70));
            onUserConnectedTextBox = SettingsLayoutHelper.AddRow(
                layout, "玩家连接时执行", SettingsLayoutHelper.CreateMultilineInput(70));
            onUserDisconnectedTextBox = SettingsLayoutHelper.AddRow(
                layout, "玩家断开连接时执行", SettingsLayoutHelper.CreateMultilineInput(70));
            onUserKickedTextBox = SettingsLayoutHelper.AddRow(
                layout, "玩家被踢出时执行", SettingsLayoutHelper.CreateMultilineInput(70));
            regularCheckTextBox = SettingsLayoutHelper.AddRow(
                layout, "定期检查脚本", SettingsLayoutHelper.CreateMultilineInput(70));
            onHackedDataTextBox = SettingsLayoutHelper.AddRow(
                layout, "检测到篡改数据", SettingsLayoutHelper.CreateMultilineInput(70));
            onDifferentDataTextBox = SettingsLayoutHelper.AddRow(
                layout, "检测到数据不一致", SettingsLayoutHelper.CreateMultilineInput(70));
            onUnsignedDataTextBox = SettingsLayoutHelper.AddRow(
                layout, "检测到未签名数据", SettingsLayoutHelper.CreateMultilineInput(70));
            return layout;
        }

        private Control BuildWhitelistSection()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            allowedLoadFileTextBox = SettingsLayoutHelper.AddRow(
                layout, "LoadFile 扩展名", SettingsLayoutHelper.CreateMultilineInput(70));
            allowedPreprocessTextBox = SettingsLayoutHelper.AddRow(
                layout, "预处理文件扩展名", SettingsLayoutHelper.CreateMultilineInput(70));
            allowedHtmlLoadTextBox = SettingsLayoutHelper.AddRow(
                layout, "HTML 加载扩展名", SettingsLayoutHelper.CreateMultilineInput(70));
            allowedHtmlUriTextBox = SettingsLayoutHelper.AddRow(
                layout, "允许的 HTML URI", SettingsLayoutHelper.CreateMultilineInput(70));
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
    }
}
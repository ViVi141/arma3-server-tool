using System;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Controls;
using AntButton = AntdUI.Button;
using AntCheckbox = AntdUI.Checkbox;
using AntInput = AntdUI.Input;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class AddLocalBanForm : AntdDialogForm
    {
        private readonly AntInput guidInput;
        private readonly AntInput reasonInput;
        private readonly AntInput expiryInput;
        private readonly AntCheckbox permanentCheckBox;

        public AddLocalBanForm()
            : base()
        {
            Text = "添加本地封禁";
            ApplyPreferredDialogSizing(520, 280, null);

            var layout = SettingsLayoutHelper.CreateFormLayout(100);
            guidInput = SettingsLayoutHelper.AddRow(
                layout,
                "GUID / IP",
                SettingsLayoutHelper.CreateInput(true));
            reasonInput = SettingsLayoutHelper.AddRow(
                layout,
                "原因",
                SettingsLayoutHelper.CreateInput(true));
            reasonInput.Text = "管理员封禁";

            permanentCheckBox = SettingsLayoutHelper.CreateCheckbox("永久封禁", true);
            SettingsLayoutHelper.AddRow(layout, "封禁类型", permanentCheckBox);

            expiryInput = SettingsLayoutHelper.AddRow(
                layout,
                "到期日期",
                SettingsLayoutHelper.CreateInput(false));
            expiryInput.Text = DateTime.Now.AddDays(30).ToString("yyyy/MM/dd");
            expiryInput.Enabled = false;

            permanentCheckBox.CheckedChanged += delegate
            {
                expiryInput.Enabled = !permanentCheckBox.Checked;
            };

            AntButton okButton = AntdUiHelper.CreatePrimaryButton("添加");
            AntButton cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            WireDialogButtons(okButton, cancelButton);

            var filler = new AntPanel { Dock = DockStyle.Fill, Padding = AppTheme.ContentPadding };
            filler.Controls.Add(SettingsLayoutHelper.CreateScrollHost(layout));

            Controls.Add(CreateButtonBar(okButton, cancelButton));
            Controls.Add(filler);
        }

        public string BanGuid
        {
            get { return guidInput.Text.Trim(); }
        }

        public string BanReason
        {
            get { return reasonInput.Text.Trim(); }
        }

        public string BanExpiry
        {
            get
            {
                if (permanentCheckBox.Checked)
                {
                    return "永久封禁";
                }

                return expiryInput.Text.Trim();
            }
        }

        public bool ValidateInput(IWin32Window owner, out string message)
        {
            if (string.IsNullOrWhiteSpace(BanGuid))
            {
                message = "请输入 GUID 或 IP。";
                AntdUiHelper.ShowWarning(owner, message, "提示");
                return false;
            }

            if (string.IsNullOrWhiteSpace(BanReason))
            {
                message = "请输入封禁原因。";
                AntdUiHelper.ShowWarning(owner, message, "提示");
                return false;
            }

            if (!permanentCheckBox.Checked && string.IsNullOrWhiteSpace(BanExpiry))
            {
                message = "请输入到期日期，或勾选永久封禁。";
                AntdUiHelper.ShowWarning(owner, message, "提示");
                return false;
            }

            message = string.Empty;
            return true;
        }
    }
}

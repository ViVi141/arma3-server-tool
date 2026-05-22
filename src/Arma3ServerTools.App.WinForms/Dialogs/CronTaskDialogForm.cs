using System;
using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Controls;
using AntButton = AntdUI.Button;
using AntCheckbox = AntdUI.Checkbox;
using AntInput = AntdUI.Input;
using AntSelect = AntdUI.Select;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class CronTaskDialogForm : AntdDialogForm
    {
        private readonly AntInput cronInput;
        private readonly AntInput remarkInput;
        private readonly AntSelect actionSelect;
        private readonly AntCheckbox enabledCheckBox;

        public CronTaskDialogForm()
            : base("添加定时任务", new Size(420, 260))
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(100);
            cronInput = SettingsLayoutHelper.AddRow(layout, "Cron 表达式", SettingsLayoutHelper.CreateInput(true));
            cronInput.Text = "0 0 4 * * ?";

            actionSelect = SettingsLayoutHelper.AddRow(layout, "操作", SettingsLayoutHelper.CreateSelect(200, "重启服务器"));
            actionSelect.SelectedIndex = 0;

            remarkInput = SettingsLayoutHelper.AddRow(layout, "备注", SettingsLayoutHelper.CreateInput(true));
            enabledCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "启用",
                SettingsLayoutHelper.CreateCheckbox("立即启用", true));

            layout.Dock = DockStyle.Fill;
            layout.Padding = AppTheme.ContentPadding;

            AntButton okButton = AntdUiHelper.CreatePrimaryButton("确定");
            AntButton cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            FlowLayoutPanel buttonBar = CreateButtonBar(okButton, cancelButton);
            WireDialogButtons(okButton, cancelButton);

            Controls.Add(layout);
            Controls.Add(buttonBar);
        }

        public string CronExpression
        {
            get { return cronInput.Text.Trim(); }
        }

        public string ActionText
        {
            get
            {
                if (actionSelect.SelectedIndex >= 0 && actionSelect.SelectedIndex < actionSelect.Items.Count)
                {
                    object itemObj = actionSelect.Items[actionSelect.SelectedIndex];
                    if (itemObj is AntdUI.SelectItem item)
                    {
                        return Convert.ToString(item.Text);
                    }
                }

                return string.Empty;
            }
        }

        public string Remark
        {
            get { return remarkInput.Text.Trim(); }
        }

        public bool IsTaskEnabled
        {
            get { return enabledCheckBox.Checked; }
        }
    }
}

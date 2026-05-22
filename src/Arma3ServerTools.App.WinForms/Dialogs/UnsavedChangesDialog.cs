using System.Drawing;
using System.Windows.Forms;
using AntButton = AntdUI.Button;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal enum UnsavedChangesChoice
    {
        Cancel = 0,
        Discard = 1,
        Save = 2,
    }

    internal sealed class UnsavedChangesDialog : AntdDialogForm
    {
        public UnsavedChangesDialog(string configName)
            : base()
        {
            Text = "未保存的更改";
            ApplyPreferredDialogSizing(440, 160, null);

            string message = "配置 \"" + configName + "\" 有未保存的修改。" + System.Environment.NewLine
                + "是否在继续之前保存？";

            var body = new AntdUI.Label
            {
                Text = message,
                Dock = DockStyle.Fill,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                MaximumSize = new Size(UiScaleHelper.Scale(400), 0),
                Padding = AppTheme.ContentPadding,
            };

            AntButton saveButton = AntdUiHelper.CreatePrimaryButton("保存");
            AntButton discardButton = AntdUiHelper.CreateToolbarButton("不保存");
            AntButton cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            saveButton.Click += delegate
            {
                Choice = UnsavedChangesChoice.Save;
                DialogResult = DialogResult.OK;
                Close();
            };
            discardButton.Click += delegate
            {
                Choice = UnsavedChangesChoice.Discard;
                DialogResult = DialogResult.OK;
                Close();
            };
            cancelButton.Click += delegate
            {
                Choice = UnsavedChangesChoice.Cancel;
                DialogResult = DialogResult.Cancel;
                Close();
            };

            var bar = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                AutoSize = true,
                Padding = new Padding(
                    UiScaleHelper.Scale(12),
                    UiScaleHelper.Scale(4),
                    UiScaleHelper.Scale(12),
                    UiScaleHelper.Scale(8)),
            };
            bar.Controls.Add(cancelButton);
            bar.Controls.Add(discardButton);
            bar.Controls.Add(saveButton);

            Controls.Add(body);
            Controls.Add(bar);
        }

        public UnsavedChangesChoice Choice { get; private set; } = UnsavedChangesChoice.Cancel;
    }
}

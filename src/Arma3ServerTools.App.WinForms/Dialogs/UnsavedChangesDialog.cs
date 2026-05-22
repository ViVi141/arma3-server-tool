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
        ApplyToServer = 3,
    }

    internal sealed class UnsavedChangesDialog : AntdDialogForm
    {
        public UnsavedChangesDialog(string configName)
            : base()
        {
            Text = "未保存的更改";
            ApplyPreferredDialogSizing(520, 200, null);

            string message = "配置 \"" + configName + "\" 有未保存的修改。"
                + System.Environment.NewLine
                + "「保存到工具」仅更新工具内 JSON；「应用到服务器目录」会写入 server.cfg 等游戏文件。";

            var body = new AntdUI.Label
            {
                Text = message,
                Dock = DockStyle.Fill,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                MaximumSize = new Size(UiScaleHelper.Scale(480), 0),
                Padding = AppTheme.ContentPadding,
            };

            AntButton applyButton = AntdUiHelper.CreatePrimaryButton(UiLabels.ApplyToServerButton);
            AntButton saveButton = AntdUiHelper.CreateToolbarButton(UiLabels.SaveToToolButton);
            AntButton discardButton = AntdUiHelper.CreateToolbarButton("不保存");
            AntButton cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            applyButton.Click += delegate
            {
                Choice = UnsavedChangesChoice.ApplyToServer;
                DialogResult = DialogResult.OK;
                Close();
            };
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
            bar.Controls.Add(applyButton);

            Controls.Add(body);
            Controls.Add(bar);
        }

        public UnsavedChangesChoice Choice { get; private set; } = UnsavedChangesChoice.Cancel;
    }
}

using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.Core.Validation;
using AntButton = AntdUI.Button;
using AntInput = AntdUI.Input;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class NewServerDialog : AntdDialogForm
    {
        private readonly AntInput nameInput;
        private readonly AntInput dirInput;

        public NewServerDialog()
            : base()
        {
            Text = "新建服务器配置";
            ApplyPreferredDialogSizing(480, 160, null);

            var layout = SettingsLayoutHelper.CreateFormLayout(96);
            nameInput = SettingsLayoutHelper.AddRow(layout, "配置名称", SettingsLayoutHelper.CreateInput(true));
            nameInput.Text = "新服务器";

            AntButton browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            browseButton.Click += OnBrowseDirectory;

            var dirPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            dirInput = SettingsLayoutHelper.CreateInput(false);
            dirInput.Width = UiScaleHelper.Scale(360);
            dirPanel.Controls.Add(dirInput);
            dirPanel.Controls.Add(browseButton);
            SettingsLayoutHelper.AddRow(layout, "服务器目录", dirPanel);

            AntButton okButton = AntdUiHelper.CreatePrimaryButton("确定");
            okButton.Click += OnConfirm;
            AntButton cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            cancelButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            Control body = SettingsLayoutHelper.CreateScrollHost(layout);

            Controls.Add(body);
            Controls.Add(CreateButtonBar(okButton, cancelButton));
        }

        private void OnConfirm(object sender, System.EventArgs e)
        {
            if (!TryValidateServerDirectory())
            {
                return;
            }

            DialogResult = DialogResult.OK;
            Close();
        }

        private bool TryValidateServerDirectory()
        {
            string directory = dirInput.Text.Trim();
            if (string.IsNullOrEmpty(directory))
            {
                return true;
            }

            if (PathValidation.ContainsChinese(directory))
            {
                AntdUiHelper.ShowWarning(this, UiLabels.PathRulesShort, "路径无效");
                return false;
            }

            return true;
        }

        private void OnBrowseDirectory(object sender, System.EventArgs e)
        {
            using (var folderDialog = new FolderBrowserDialog())
            {
                if (folderDialog.ShowDialog(this) == DialogResult.OK)
                {
                    dirInput.Text = folderDialog.SelectedPath;
                }
            }
        }

        public string ConfigName
        {
            get { return nameInput.Text.Trim(); }
        }

        public string ServerDirectory
        {
            get { return dirInput.Text.Trim(); }
        }
    }
}

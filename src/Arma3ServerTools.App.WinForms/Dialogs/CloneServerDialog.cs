using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Validation;
using AntButton = AntdUI.Button;
using AntInput = AntdUI.Input;
using AntLabel = AntdUI.Label;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class CloneServerDialog : AntdDialogForm
    {
        private readonly AntInput nameInput;
        private readonly AntInput dirInput;

        public CloneServerDialog(ArmaServerConfig source)
            : base()
        {
            Text = "复制服务器配置";
            ApplyPreferredDialogSizing(480, 180, null);

            var layout = SettingsLayoutHelper.CreateFormLayout(96);
            string defaultName = "副本";
            if (source != null && !string.IsNullOrWhiteSpace(source.ConfigName))
            {
                defaultName = source.ConfigName.Trim() + " - 副本";
            }

            nameInput = SettingsLayoutHelper.AddRow(layout, "配置名称", SettingsLayoutHelper.CreateInput(true));
            nameInput.Text = defaultName;

            AntButton browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            browseButton.Click += OnBrowseDirectory;

            var dirPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            dirInput = SettingsLayoutHelper.CreateInput(false);
            dirInput.Width = UiScaleHelper.Scale(360);
            if (source != null && !string.IsNullOrWhiteSpace(source.ServerDir))
            {
                dirInput.Text = source.ServerDir;
            }

            dirPanel.Controls.Add(dirInput);
            dirPanel.Controls.Add(browseButton);
            SettingsLayoutHelper.AddRow(layout, "服务器目录", dirPanel);

            AntLabel hint = AntdUiHelper.CreateHintLabel(
                "将复制当前 json 配置并生成新 UUID。不会复制服务器文件目录内容。",
                440);
            hint.Dock = DockStyle.Top;

            AntButton okButton = AntdUiHelper.CreatePrimaryButton("确定");
            okButton.Click += OnConfirm;
            AntButton cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            cancelButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            Control body = SettingsLayoutHelper.CreateScrollHost(layout);

            Controls.Add(CreateButtonBar(okButton, cancelButton));
            Controls.Add(body);
            Controls.Add(hint);
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

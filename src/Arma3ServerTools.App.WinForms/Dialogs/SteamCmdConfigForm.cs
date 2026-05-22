using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class SteamCmdConfigForm : Form
    {
        private readonly TextBox userTextBox;
        private readonly TextBox passwordTextBox;
        private readonly TextBox workshopRootTextBox;
        private readonly TextBox serverInstallTextBox;

        public SteamCmdConfigForm(SteamcmdEntity current)
        {
            Text = "SteamCMD 配置";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            ClientSize = new Size(520, 240);

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                Padding = new Padding(12),
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            userTextBox = AddRow(layout, "Steam 账号", new TextBox { Dock = DockStyle.Fill });
            passwordTextBox = AddRow(layout, "Steam 密码", new TextBox { Dock = DockStyle.Fill, UseSystemPasswordChar = true });
            workshopRootTextBox = AddBrowseRow(layout, "Workshop 根目录", out Button browseWorkshop);
            serverInstallTextBox = AddBrowseRow(layout, "专用服务器目录", out Button browseServer);
            browseWorkshop.Click += delegate { BrowseDirectory(workshopRootTextBox); };
            browseServer.Click += delegate { BrowseDirectory(serverInstallTextBox); };

            if (current != null)
            {
                userTextBox.Text = current.u ?? string.Empty;
                passwordTextBox.Text = current.p ?? string.Empty;
                workshopRootTextBox.Text = current.d ?? string.Empty;
                serverInstallTextBox.Text = current.i ?? string.Empty;
            }

            var okButton = new Button { Text = "保存", DialogResult = DialogResult.OK, Width = 80 };
            var cancelButton = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Width = 80 };
            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                Height = 44,
                Padding = new Padding(12, 6, 12, 8),
            };
            buttons.Controls.Add(cancelButton);
            buttons.Controls.Add(okButton);
            Controls.Add(layout);
            Controls.Add(buttons);
            AcceptButton = okButton;
            CancelButton = cancelButton;
        }

        public SteamcmdEntity BuildSettings()
        {
            return new SteamcmdEntity
            {
                u = userTextBox.Text.Trim(),
                p = passwordTextBox.Text,
                d = workshopRootTextBox.Text.Trim(),
                i = serverInstallTextBox.Text.Trim(),
            };
        }

        public OperationResult ValidateSettings()
        {
            if (ContainsChinese(userTextBox.Text)
                || ContainsChinese(passwordTextBox.Text)
                || ContainsChinese(workshopRootTextBox.Text)
                || ContainsChinese(serverInstallTextBox.Text))
            {
                return OperationResult.Fail("SteamCMD 相关路径和账号不能包含中文。");
            }

            return OperationResult.Ok();
        }

        private void BrowseDirectory(TextBox target)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                if (!string.IsNullOrEmpty(target.Text))
                {
                    dialog.SelectedPath = target.Text;
                }

                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    target.Text = dialog.SelectedPath;
                }
            }
        }

        private static bool ContainsChinese(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return false;
            }

            return Regex.IsMatch(value, @"[\u4e00-\u9fa5]");
        }

        private static TextBox AddBrowseRow(TableLayoutPanel layout, string label, out Button browseButton)
        {
            var panel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            var textBox = new TextBox { Width = 320 };
            browseButton = new Button { Text = "浏览...", AutoSize = true };
            panel.Controls.Add(textBox);
            panel.Controls.Add(browseButton);
            AddRow(layout, label, panel);
            return textBox;
        }

        private static T AddRow<T>(TableLayoutPanel layout, string label, T control) where T : Control
        {
            int row = layout.RowCount;
            layout.RowCount++;
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.Controls.Add(new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left }, 0, row);
            layout.Controls.Add(control, 1, row);
            return control;
        }
    }
}

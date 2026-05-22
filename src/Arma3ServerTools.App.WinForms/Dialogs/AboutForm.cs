using System;
using System.Diagnostics;
using System.Reflection;
using System.Windows.Forms;
using AntButton = AntdUI.Button;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class AboutForm : AntdDialogForm
    {
        public AboutForm()
            : base()
        {
            Text = "关于";
            ApplyPreferredDialogSizing(520, 360, null);

            Assembly assembly = Assembly.GetExecutingAssembly();
            string versionText = AppVersion.GetDisplayVersion();

            AntLabel body = AntdUiHelper.CreateHintLabel(
                UiLabels.AppTitle + Environment.NewLine
                + "版本: " + versionText + Environment.NewLine + Environment.NewLine
                + "Arma 3 专用服务器配置与管理工具。" + Environment.NewLine
                + "基于 Apache License 2.0 开源。" + Environment.NewLine + Environment.NewLine
                + "维护: ViVi141 — https://github.com/ViVi141/arma3-server-tool" + Environment.NewLine
                + "原作者: Blue、七龙 (destiny studio)" + Environment.NewLine
                + "原项目: https://destiny.cool/s/arma3-tool",
                480);
            body.Dock = DockStyle.Fill;
            body.Padding = AppTheme.ContentPadding;

            AntButton licenseButton = AntdUiHelper.CreateToolbarButton("查看 LICENSE");
            licenseButton.Click += delegate
            {
                TryOpenRepoFile("LICENSE");
            };

            AntButton noticeButton = AntdUiHelper.CreateToolbarButton("查看 NOTICE");
            noticeButton.Click += delegate
            {
                TryOpenRepoFile("NOTICE");
            };

            AntButton closeButton = AntdUiHelper.CreatePrimaryButton("关闭");
            closeButton.Click += delegate
            {
                DialogResult = DialogResult.OK;
                Close();
            };

            var buttonBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                AutoSize = true,
                Padding = UiScaleHelper.ScalePadding(12, 4, 12, 8),
            };
            buttonBar.Controls.Add(closeButton);
            buttonBar.Controls.Add(noticeButton);
            buttonBar.Controls.Add(licenseButton);

            var filler = new AntPanel { Dock = DockStyle.Fill };
            filler.Controls.Add(body);

            Controls.Add(buttonBar);
            Controls.Add(filler);
        }

        private static void TryOpenRepoFile(string fileName)
        {
            string baseDir = AppContext.BaseDirectory;
            string path = System.IO.Path.Combine(baseDir, fileName);
            if (!System.IO.File.Exists(path))
            {
                path = System.IO.Path.GetFullPath(
                    System.IO.Path.Combine(baseDir, "..", "..", "..", "..", fileName));
            }

            if (!System.IO.File.Exists(path))
            {
                AntdUiHelper.ShowInfo(null, "未找到文件: " + fileName, "提示");
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = path,
                UseShellExecute = true,
            });
        }
    }
}

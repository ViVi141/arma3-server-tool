using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Arma3ServerTools.Application.Services;
using AntButton = AntdUI.Button;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class RptLogViewerForm : AntdDialogForm
    {
        private const int MaxContentChars = 200000;
        private readonly RptLogService logService;
        private readonly string filePath;
        private readonly AntLabel pathLabel;
        private readonly TextBox contentBox;
        private readonly System.Windows.Forms.Timer refreshTimer;
        private long lastReadPosition;

        public RptLogViewerForm(string filePath, RptLogService logService)
            : base()
        {
            this.filePath = filePath ?? string.Empty;
            this.logService = logService ?? new RptLogService();
            Text = "RPT 日志";
            ApplyPreferredDialogSizing(900, 560, null);

            pathLabel = new AntLabel
            {
                Dock = DockStyle.Top,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = UiScaleHelper.ScalePadding(12, 8),
                Text = filePath,
            };

            contentBox = new TextBox
            {
                Dock = DockStyle.Fill,
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Both,
                Font = new System.Drawing.Font("Consolas", UiScaleHelper.Scale(9)),
                WordWrap = false,
            };

            AntButton refreshButton = AntdUiHelper.CreateToolbarButton("刷新");
            refreshButton.Click += delegate { ReloadContent(true); };

            AntButton openFolderButton = AntdUiHelper.CreateToolbarButton("打开所在目录");
            openFolderButton.Click += OnOpenFolder;

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
            buttonBar.Controls.Add(openFolderButton);
            buttonBar.Controls.Add(refreshButton);

            var filler = new AntPanel { Dock = DockStyle.Fill, Padding = AppTheme.ContentPadding };
            filler.Controls.Add(contentBox);

            Controls.Add(buttonBar);
            Controls.Add(filler);
            Controls.Add(pathLabel);

            refreshTimer = new System.Windows.Forms.Timer();
            refreshTimer.Interval = 3000;
            refreshTimer.Tick += delegate { ReloadContent(false); };
            refreshTimer.Start();

            FormClosed += delegate
            {
                refreshTimer.Stop();
                refreshTimer.Dispose();
            };

            ReloadContent(true);
        }

        private void ReloadContent(bool scrollToEnd)
        {
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
            {
                contentBox.Text = "日志文件不存在。";
                return;
            }

            try
            {
                pathLabel.Text = filePath + "  (更新: " + File.GetLastWriteTime(filePath).ToString("yyyy-MM-dd HH:mm:ss") + ")";
                if (scrollToEnd)
                {
                    contentBox.Text = logService.ReadTail(filePath, 400);
                    UpdateLastReadPosition();
                    contentBox.SelectionStart = contentBox.TextLength;
                    contentBox.ScrollToCaret();
                    return;
                }

                string delta = logService.ReadDelta(filePath, ref lastReadPosition);
                if (!string.IsNullOrEmpty(delta))
                {
                    bool wasAtEnd = contentBox.SelectionStart >= contentBox.TextLength;
                    contentBox.AppendText(delta);
                    TrimContentIfNeeded();
                    if (wasAtEnd)
                    {
                        contentBox.SelectionStart = contentBox.TextLength;
                        contentBox.ScrollToCaret();
                    }
                }
            }
            catch (Exception ex)
            {
                contentBox.Text = "读取失败: " + ex.Message;
            }
        }

        private void OnOpenFolder(object sender, EventArgs e)
        {
            if (string.IsNullOrEmpty(filePath))
            {
                return;
            }

            string directory = Path.GetDirectoryName(filePath);
            if (string.IsNullOrEmpty(directory))
            {
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = directory,
                UseShellExecute = true,
            });
        }

        private void UpdateLastReadPosition()
        {
            try
            {
                using (var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    lastReadPosition = stream.Length;
                }
            }
            catch
            {
                lastReadPosition = 0;
            }
        }

        private void TrimContentIfNeeded()
        {
            if (contentBox.TextLength <= MaxContentChars)
            {
                return;
            }

            int removeLength = contentBox.TextLength - MaxContentChars;
            if (removeLength < 0)
            {
                removeLength = 0;
            }

            int firstNewLineIndex = contentBox.Text.IndexOf(Environment.NewLine, removeLength, StringComparison.Ordinal);
            if (firstNewLineIndex > 0)
            {
                removeLength = firstNewLineIndex + Environment.NewLine.Length;
            }

            if (removeLength > 0 && removeLength < contentBox.TextLength)
            {
                contentBox.Text = contentBox.Text.Substring(removeLength);
            }
        }
    }
}

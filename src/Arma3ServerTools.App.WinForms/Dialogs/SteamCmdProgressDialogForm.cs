using System;
using System.Drawing;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class SteamCmdProgressDialogForm : Form
    {
        private readonly Label statusLabel;
        private readonly ProgressBar progressBar;
        private TaskCompletionSource<OperationResult> completionSource;

        public SteamCmdProgressDialogForm()
        {
            Text = "SteamCMD";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            ControlBox = true;
            StartPosition = FormStartPosition.CenterParent;
            AutoScaleMode = AutoScaleMode.Font;
            Font = AppTheme.UiFont;
            ClientSize = UiScaleHelper.ScaleSize(480, 160);

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 2,
                Padding = UiScaleHelper.ScalePadding(16, 12, 16, 12),
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, UiScaleHelper.Scale(26)));

            statusLabel = new Label
            {
                AutoSize = true,
                Dock = DockStyle.Fill,
                MaximumSize = new Size(UiScaleHelper.Scale(448), 0),
                Text = "准备中…",
            };

            progressBar = new ProgressBar
            {
                Dock = DockStyle.Fill,
                Style = ProgressBarStyle.Marquee,
                MarqueeAnimationSpeed = 30,
            };

            layout.Controls.Add(statusLabel, 0, 0);
            layout.Controls.Add(progressBar, 0, 1);
            Controls.Add(layout);
        }

        public async Task<OperationResult> ExecuteAsync(
            IWin32Window owner,
            Func<IProgress<SteamCmdDownloadProgress>, CancellationToken, Task<OperationResult>> work)
        {
            if (work == null)
            {
                throw new ArgumentNullException(nameof(work));
            }

            completionSource = new TaskCompletionSource<OperationResult>();
            IProgress<SteamCmdDownloadProgress> progress = new Progress<SteamCmdDownloadProgress>(ApplyProgress);

            Shown += OnShownRunWork;

            async void OnShownRunWork(object sender, EventArgs e)
            {
                Shown -= OnShownRunWork;
                try
                {
                    OperationResult result = await work(progress, CancellationToken.None).ConfigureAwait(true);
                    completionSource.TrySetResult(result);
                }
                catch (Exception ex)
                {
                    completionSource.TrySetResult(OperationResult.Fail(ex.Message));
                }
                finally
                {
                    Close();
                }
            }

            if (owner is Form ownerForm)
            {
                ShowDialog(ownerForm);
            }
            else
            {
                ShowDialog();
            }

            return await completionSource.Task.ConfigureAwait(true);
        }

        private void ApplyProgress(SteamCmdDownloadProgress report)
        {
            if (report == null || IsDisposed)
            {
                return;
            }

            statusLabel.Text = report.Stage;
            if (report.Percent >= 0)
            {
                progressBar.Style = ProgressBarStyle.Continuous;
                int value = report.Percent;
                if (value > 100)
                {
                    value = 100;
                }

                if (value < progressBar.Minimum)
                {
                    value = progressBar.Minimum;
                }

                progressBar.Value = value;
            }
            else
            {
                progressBar.Style = ProgressBarStyle.Marquee;
            }
        }

        public static Task<OperationResult> RunDownloadAsync(
            IWin32Window owner,
            ISteamCmdService steamCmdService,
            bool downloadIfMissing)
        {
            if (steamCmdService == null)
            {
                throw new ArgumentNullException(nameof(steamCmdService));
            }

            using (var dialog = new SteamCmdProgressDialogForm())
            {
                return dialog.ExecuteAsync(
                    owner,
                    (progress, cancellationToken) =>
                        steamCmdService.EnsureSteamCmdAvailableAsync(
                            downloadIfMissing,
                            cancellationToken,
                            progress));
            }
        }
    }
}

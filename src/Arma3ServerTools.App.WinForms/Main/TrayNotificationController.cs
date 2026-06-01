using System;
using System.Drawing;
using System.Windows.Forms;

namespace Arma3ServerTools.App.WinForms.Main
{
    internal sealed class TrayNotificationController : IDisposable
    {
        private readonly NotifyIcon notifyIcon;
        private bool exitRequested;

        public TrayNotificationController()
        {
            notifyIcon = new NotifyIcon
            {
                Visible = false,
                Text = UiLabels.AppTitle,
            };

            Icon appIcon = AppIcon.GetIcon();
            if (appIcon != null)
            {
                notifyIcon.Icon = appIcon;
            }
        }

        public event EventHandler ExitRequested;

        public bool ExitRequestedFlag
        {
            get { return exitRequested; }
        }

        public void AttachToForm(Form form)
        {
            Icon appIcon = AppIcon.GetIcon();
            if (appIcon != null)
            {
                notifyIcon.Icon = appIcon;
            }

            var contextMenu = new ContextMenuStrip();
            ToolStripMenuItem showItem = new ToolStripMenuItem("显示主窗口");
            showItem.Click += delegate (object sender, EventArgs e)
            {
                ShowMainWindow(form);
            };
            ToolStripMenuItem exitItem = new ToolStripMenuItem("退出");
            exitItem.Click += delegate (object sender, EventArgs e)
            {
                exitRequested = true;
                if (ExitRequested != null)
                {
                    ExitRequested.Invoke(this, EventArgs.Empty);
                }

                form.Close();
            };
            contextMenu.Items.Add(showItem);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add(exitItem);
            notifyIcon.ContextMenuStrip = contextMenu;
            notifyIcon.DoubleClick += delegate (object sender, EventArgs e)
            {
                ShowMainWindow(form);
            };
        }

        public void SyncIcon(System.Drawing.Icon icon)
        {
            if (icon != null)
            {
                notifyIcon.Icon = icon;
            }
        }

        public void MinimizeFormToTray(Form form)
        {
            form.Hide();
            notifyIcon.Visible = true;

            if (!AppUiSettings.Instance.HasShownTrayMinimizeHint)
            {
                AppUiSettings.Instance.HasShownTrayMinimizeHint = true;
                notifyIcon.BalloonTipTitle = UiLabels.AppTitle;
                notifyIcon.BalloonTipText = "已最小化到系统托盘（任务栏右下角），双击图标可恢复窗口";
                notifyIcon.BalloonTipIcon = ToolTipIcon.Info;
                notifyIcon.ShowBalloonTip(5000);
            }
        }

        public void ShowMainWindow(Form form)
        {
            form.Show();
            form.WindowState = FormWindowState.Normal;
            form.Activate();
            form.BringToFront();
        }

        public void UpdateRunningCount(int runningCount)
        {
            if (runningCount > 0)
            {
                notifyIcon.Text = UiLabels.AppTitle + "（" + runningCount + " 台运行中）";
            }
            else
            {
                notifyIcon.Text = UiLabels.AppTitle;
            }
        }

        public void ShowServerStoppedBalloon(string serverName)
        {
            notifyIcon.BalloonTipTitle = "服务器已停止";
            notifyIcon.BalloonTipText = serverName + " 进程已退出。请检查日志或重新启动。";
            notifyIcon.Visible = true;
            notifyIcon.ShowBalloonTip(5000);
        }

        public void Dispose()
        {
            if (notifyIcon != null)
            {
                notifyIcon.Visible = false;
                notifyIcon.Dispose();
            }
        }
    }
}

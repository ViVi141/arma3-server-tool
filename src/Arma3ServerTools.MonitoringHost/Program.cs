using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.MonitoringHost
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            System.Windows.Forms.Application.EnableVisualStyles();
            System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);
            System.Windows.Forms.Application.Run(new MonitoringHostForm());
        }
    }

    internal sealed class MonitoringHostForm : Form
    {
        public const string WindowTitle = "A3-DestinyStudio-ProcessCommunicationModule";
        private const int WmCopyData = 0x004A;

        private readonly QueuedMonitoringIngestService ingestService;

        public MonitoringHostForm()
        {
            Text = WindowTitle;
            Width = 655;
            Height = 33;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            ControlBox = false;
            TopMost = true;
            StartPosition = FormStartPosition.CenterScreen;
            ShowInTaskbar = true;

            var label = new Label
            {
                Text = "进程通信模块运行中（接收 ARMA3 监控数据）",
                Dock = DockStyle.Fill,
                TextAlign = System.Drawing.ContentAlignment.MiddleCenter,
            };
            Controls.Add(label);

            var paths = new AppPaths(AppContext.BaseDirectory);
            ingestService = new QueuedMonitoringIngestService(new MonitoringDatabase(paths));

            Load += OnFormLoad;
            FormClosed += OnFormClosed;
        }

        private void OnFormClosed(object sender, FormClosedEventArgs e)
        {
            ingestService.Dispose();
        }

        private void OnFormLoad(object sender, EventArgs e)
        {
            Timer timer = new Timer();
            timer.Interval = 2500;
            timer.Tick += delegate
            {
                timer.Stop();
                Hide();
            };
            timer.Start();
        }

        protected override void DefWndProc(ref Message message)
        {
            if (message.Msg == WmCopyData)
            {
                CopyDataStruct data = new CopyDataStruct();
                Type structType = data.GetType();
                data = (CopyDataStruct)message.GetLParam(structType);
                if (!string.IsNullOrEmpty(data.lpData))
                {
                    ingestService.Ingest(data.lpData);
                }

                return;
            }

            base.DefWndProc(ref message);
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CopyDataStruct
        {
            public IntPtr dwData;
            public int cbData;

            [MarshalAs(UnmanagedType.LPStr)]
            public string lpData;
        }
    }
}

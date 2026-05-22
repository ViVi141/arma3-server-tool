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
        public const string WindowTitle = ToolConstants.MonitoringHostWindowTitle;
        private const int WmCopyData = 0x004A;

        private readonly QueuedMonitoringIngestService ingestService;

        public MonitoringHostForm()
        {
            Text = WindowTitle;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            Location = new System.Drawing.Point(-32000, -32000);
            Size = new System.Drawing.Size(1, 1);
            Opacity = 0;

            var paths = new AppPaths(AppContext.BaseDirectory);
            ingestService = new QueuedMonitoringIngestService(new MonitoringDatabase(paths));

            FormClosed += OnFormClosed;
        }

        protected override void SetVisibleCore(bool value)
        {
            if (!IsHandleCreated)
            {
                CreateHandle();
            }

            base.SetVisibleCore(false);
        }

        private void OnFormClosed(object sender, FormClosedEventArgs e)
        {
            ingestService.Dispose();
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

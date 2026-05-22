using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using AntButton = AntdUI.Button;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class BikeyListForm : AntdDialogForm
    {
        private readonly AntTable keysTable;
        private readonly AntLabel hintLabel;
        private readonly List<BikeyRow> rows = new List<BikeyRow>();

        public BikeyListForm(string serverDir, IList<string> keyPaths)
            : base()
        {
            Text = "服务器 Bikey 列表";
            ApplyPreferredDialogSizing(720, 480, null);

            hintLabel = new AntLabel
            {
                Dock = DockStyle.Top,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = UiScaleHelper.ScalePadding(12, 8),
                Text = "Keys 目录: " + Path.Combine(serverDir ?? string.Empty, "Keys"),
            };

            keysTable = AntdTableHelper.CreateStandardTable();
            keysTable.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.Column("FileName", "文件名") { ReadOnly = true, Width = "40%" },
                new AntdUI.Column("FullPath", "完整路径") { ReadOnly = true, Width = "60%", Ellipsis = true },
            };

            if (keyPaths != null)
            {
                foreach (string path in keyPaths)
                {
                    if (string.IsNullOrWhiteSpace(path))
                    {
                        continue;
                    }

                    rows.Add(
                        new BikeyRow
                        {
                            FileName = Path.GetFileName(path),
                            FullPath = path,
                        });
                }
            }

            AntdTableHelper.BindList(keysTable, rows);

            AntButton openFolderButton = AntdUiHelper.CreateToolbarButton("打开 Keys 目录");
            openFolderButton.Click += delegate
            {
                string keysDir = Path.Combine(serverDir ?? string.Empty, "Keys");
                Directory.CreateDirectory(keysDir);
                Process.Start(new ProcessStartInfo
                {
                    FileName = keysDir,
                    UseShellExecute = true,
                });
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
            buttonBar.Controls.Add(openFolderButton);

            var filler = new AntPanel { Dock = DockStyle.Fill };
            filler.Controls.Add(keysTable);

            Controls.Add(buttonBar);
            Controls.Add(filler);
            Controls.Add(hintLabel);
        }

        private sealed class BikeyRow
        {
            public string FileName { get; set; } = string.Empty;

            public string FullPath { get; set; } = string.Empty;
        }
    }
}

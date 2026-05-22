using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using AntCheckbox = AntdUI.Checkbox;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;
using AntSelect = AntdUI.Select;
using AntTable = AntdUI.Table;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Controls;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class HtmlModEnableForm : AntdDialogForm
    {
        private readonly List<LauncherHtmlModEntry> entries;
        private readonly ModEnablerService enablerService;
        private readonly string workshopRoot;

        private readonly AntTable grid;
        private readonly AntSelect targetSelect;
        private readonly AntCheckbox downloadMissingCheckBox;
        private readonly AntLabel statusLabel;

        private readonly List<HtmlModGridRow> gridRows;

        public HtmlModEnableForm(
            IList<LauncherHtmlModEntry> htmlEntries,
            string workshopRoot,
            ModEnablerService enablerService)
        {
            this.workshopRoot = workshopRoot ?? string.Empty;
            this.enablerService = enablerService ?? new ModEnablerService();
            entries = new List<LauncherHtmlModEntry>();
            if (htmlEntries != null)
            {
                foreach (LauncherHtmlModEntry entry in htmlEntries)
                {
                    entries.Add(new LauncherHtmlModEntry
                    {
                        ModId = entry.ModId,
                        DisplayName = entry.DisplayName,
                        Selected = entry.Selected,
                    });
                }
            }

            gridRows = new List<HtmlModGridRow>();
            foreach (LauncherHtmlModEntry entry in entries)
            {
                gridRows.Add(new HtmlModGridRow(entry));
            }

            Text = "从 HTML 启用模组";
            ApplyPreferredDialogSizing(920, 560, null);

            statusLabel = new AntLabel
            {
                Dock = DockStyle.Top,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = UiScaleHelper.ScalePadding(12, 6),
                Text = "勾选要启用的模组，并选择应用到客户端 / 服务端 / 无头 / 全部。",
            };

            var targetPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(UiScaleHelper.Scale(12), 0, UiScaleHelper.Scale(12), UiScaleHelper.Scale(8)),
            };
            var applyLabel = new AntLabel
            {
                Text = "应用到:",
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(0, UiScaleHelper.Scale(6), UiScaleHelper.Scale(8), 0),
            };
            targetPanel.Controls.Add(applyLabel);

            targetSelect = SettingsLayoutHelper.CreateSelect(
                220,
                "客户端模组 (-mod)",
                "服务器模组 (-serverMod)",
                "无头客户端 (HC -mod)",
                "全部 (客户端 + 服务端 + 无头)");
            targetSelect.SelectedIndex = 0;
            targetPanel.Controls.Add(targetSelect);

            downloadMissingCheckBox = SettingsLayoutHelper.CreateCheckbox("启用前下载未安装的模组", false);
            downloadMissingCheckBox.Margin = new Padding(UiScaleHelper.Scale(16), UiScaleHelper.Scale(4), 0, 0);
            targetPanel.Controls.Add(downloadMissingCheckBox);

            grid = AntdTableHelper.CreateStandardTable();
            grid.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.ColumnCheck("Selected", "启用") { Width = "10%", Editable = true },
                new AntdUI.Column("Title", "模组名称") { Width = "38%", Ellipsis = true, ReadOnly = true },
                new AntdUI.Column("ModId", "Workshop ID") { Width = "18%", Align = AntdUI.ColumnAlign.Center },
                new AntdUI.Column("InstallStatus", "本地状态") { Width = "18%", Align = AntdUI.ColumnAlign.Center },
            };
            grid.CheckedChanged += OnGridCheckedChanged;

            var cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            cancelButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            var okButton = AntdUiHelper.CreatePrimaryButton("启用选中");
            okButton.Click += delegate
            {
                DialogResult = DialogResult.OK;
                Close();
            };

            Control buttonBar = CreateButtonBar(okButton, cancelButton, "启用选中", "取消");

            var filler = new AntPanel { Dock = DockStyle.Fill };
            filler.Controls.Add(grid);

            Controls.Add(buttonBar);
            Controls.Add(filler);
            Controls.Add(targetPanel);
            Controls.Add(statusLabel);

            ReloadTable();
        }

        public IList<LauncherHtmlModEntry> GetSelectedEntries()
        {
            var result = new List<LauncherHtmlModEntry>();
            foreach (LauncherHtmlModEntry entry in entries)
            {
                if (entry.Selected)
                {
                    result.Add(entry);
                }
            }

            return result;
        }

        public ModApplyTarget GetApplyTarget()
        {
            if (targetSelect.SelectedIndex == 1)
            {
                return ModApplyTarget.Server;
            }

            if (targetSelect.SelectedIndex == 2)
            {
                return ModApplyTarget.Headless;
            }

            if (targetSelect.SelectedIndex == 3)
            {
                return ModApplyTarget.All;
            }

            return ModApplyTarget.Client;
        }

        public bool ShouldDownloadMissing()
        {
            return downloadMissingCheckBox.Checked;
        }

        private void ReloadTable()
        {
            foreach (HtmlModGridRow row in gridRows)
            {
                row.RefreshInstallStatus(enablerService, workshopRoot);
            }

            grid.DataSource = null;
            AntdTableHelper.BindList(grid, gridRows);
        }

        private void OnGridCheckedChanged(object sender, AntdUI.TableCheckEventArgs e)
        {
            var bindRow = e.Record as HtmlModGridRow;
            if (bindRow == null)
            {
                return;
            }

            bindRow.Selected = e.Value;
        }

        private sealed class HtmlModGridRow
        {
            private readonly LauncherHtmlModEntry entry;

            public HtmlModGridRow(LauncherHtmlModEntry entry)
            {
                this.entry = entry;
            }

            public bool Selected
            {
                get { return entry.Selected; }
                set { entry.Selected = value; }
            }

            public ulong ModId { get { return entry.ModId; } }

            public string Title
            {
                get
                {
                    if (!string.IsNullOrWhiteSpace(entry.DisplayName))
                    {
                        return entry.DisplayName.Trim();
                    }

                    return "Workshop " + entry.ModId;
                }
            }

            public string InstallStatus { get; private set; }

            public void RefreshInstallStatus(ModEnablerService svc, string root)
            {
                if (svc.IsModInstalled(root, entry.ModId))
                {
                    InstallStatus = "已安装";
                }
                else
                {
                    InstallStatus = "未安装";
                }
            }
        }
    }
}

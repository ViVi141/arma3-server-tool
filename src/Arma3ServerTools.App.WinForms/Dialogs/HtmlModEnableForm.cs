using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.Application.Services;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class HtmlModEnableForm : Form
    {
        private readonly List<LauncherHtmlModEntry> entries;
        private readonly ModEnablerService enablerService;
        private readonly string workshopRoot;

        private readonly DataGridView grid;
        private readonly ComboBox targetComboBox;
        private readonly CheckBox downloadMissingCheckBox;
        private readonly Label statusLabel;

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

            Text = "从 HTML 启用模组";
            Width = 920;
            Height = 560;
            StartPosition = FormStartPosition.CenterParent;

            statusLabel = new Label
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(12, 12, 12, 6),
                Text = "勾选要启用的模组，并选择应用到客户端 / 服务端 / 无头 / 全部。",
            };

            var targetPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(12, 0, 12, 8),
            };
            targetPanel.Controls.Add(new Label { Text = "应用到:", AutoSize = true, Padding = new Padding(0, 6, 8, 0) });
            targetComboBox = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Width = 220,
            };
            targetComboBox.Items.Add("客户端模组 (-mod)");
            targetComboBox.Items.Add("服务器模组 (-serverMod)");
            targetComboBox.Items.Add("无头客户端 (HC -mod)");
            targetComboBox.Items.Add("全部 (客户端 + 服务端 + 无头)");
            targetComboBox.SelectedIndex = 0;
            targetPanel.Controls.Add(targetComboBox);
            downloadMissingCheckBox = new CheckBox
            {
                Text = "启用前下载未安装的模组",
                AutoSize = true,
                Padding = new Padding(16, 4, 0, 0),
            };
            targetPanel.Controls.Add(downloadMissingCheckBox);

            grid = new DataGridView
            {
                Dock = DockStyle.Fill,
                AllowUserToAddRows = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            };
            grid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "Selected", HeaderText = "启用" });
            grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Title", HeaderText = "模组名称", ReadOnly = true });
            grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "ModId", HeaderText = "Workshop ID", ReadOnly = true });
            grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "InstallStatus", HeaderText = "本地状态", ReadOnly = true });

            var okButton = new Button { Text = "启用选中", DialogResult = DialogResult.OK, Width = 90 };
            var cancelButton = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Width = 90 };
            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                Height = 44,
                Padding = new Padding(12, 6, 12, 8),
            };
            buttons.Controls.Add(cancelButton);
            buttons.Controls.Add(okButton);

            Controls.Add(grid);
            Controls.Add(targetPanel);
            Controls.Add(statusLabel);
            Controls.Add(buttons);
            AcceptButton = okButton;
            CancelButton = cancelButton;

            ReloadGrid();
        }

        public IList<LauncherHtmlModEntry> GetSelectedEntries()
        {
            SyncSelectionFromGrid();
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
            if (targetComboBox.SelectedIndex == 1)
            {
                return ModApplyTarget.Server;
            }

            if (targetComboBox.SelectedIndex == 2)
            {
                return ModApplyTarget.Headless;
            }

            if (targetComboBox.SelectedIndex == 3)
            {
                return ModApplyTarget.All;
            }

            return ModApplyTarget.Client;
        }

        public bool ShouldDownloadMissing()
        {
            return downloadMissingCheckBox.Checked;
        }

        private void ReloadGrid()
        {
            grid.Rows.Clear();
            foreach (LauncherHtmlModEntry entry in entries)
            {
                string status = "未安装";
                if (enablerService.IsModInstalled(workshopRoot, entry.ModId))
                {
                    status = "已安装";
                }

                string title = entry.DisplayName;
                if (string.IsNullOrWhiteSpace(title))
                {
                    title = "Workshop " + entry.ModId;
                }

                grid.Rows.Add(entry.Selected, title, entry.ModId, status);
            }
        }

        private void SyncSelectionFromGrid()
        {
            for (int i = 0; i < grid.Rows.Count; i++)
            {
                if (i >= entries.Count)
                {
                    break;
                }

                object cellValue = grid.Rows[i].Cells["Selected"].Value;
                entries[i].Selected = cellValue != null && Convert.ToBoolean(cellValue);
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (DialogResult == DialogResult.OK)
            {
                SyncSelectionFromGrid();
            }

            base.OnFormClosing(e);
        }
    }
}

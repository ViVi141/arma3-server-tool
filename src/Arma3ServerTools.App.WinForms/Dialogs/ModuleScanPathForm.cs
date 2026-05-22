using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class ModuleScanPathForm : Form
    {
        private readonly DataGridView grid;
        private readonly List<ModuleScanPathEntity> paths;

        public ModuleScanPathForm(IList<ModuleScanPathEntity> initial)
        {
            Text = "模组扫描路径";
            Width = 760;
            Height = 420;
            StartPosition = FormStartPosition.CenterParent;
            paths = new List<ModuleScanPathEntity>();
            if (initial != null)
            {
                paths.AddRange(initial);
            }

            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(8) };
            var addButton = new Button { Text = "添加", AutoSize = true };
            var removeButton = new Button { Text = "删除", AutoSize = true };
            addButton.Click += OnAdd;
            removeButton.Click += OnRemove;
            toolbar.Controls.Add(addButton);
            toolbar.Controls.Add(removeButton);

            grid = new DataGridView
            {
                Dock = DockStyle.Fill,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                AllowUserToAddRows = false,
            };
            grid.Columns.Add("ModulePath", "扫描路径");
            grid.Columns.Add("Prefix", "前缀过滤");
            grid.Columns.Add("Remark", "备注");

            var okButton = new Button { Text = "确定", DialogResult = DialogResult.OK, Width = 80 };
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

            Controls.Add(grid);
            Controls.Add(toolbar);
            Controls.Add(buttons);
            AcceptButton = okButton;
            CancelButton = cancelButton;
            ReloadGrid();
        }

        public IList<ModuleScanPathEntity> GetPaths()
        {
            return paths;
        }

        private void ReloadGrid()
        {
            grid.Rows.Clear();
            foreach (ModuleScanPathEntity item in paths)
            {
                grid.Rows.Add(item.ModulePath, item.Prefix, item.Remark);
            }
        }

        private void OnAdd(object sender, EventArgs e)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                if (dialog.ShowDialog(this) != DialogResult.OK)
                {
                    return;
                }

                paths.Add(new ModuleScanPathEntity(dialog.SelectedPath, string.Empty, "手动添加"));
                ReloadGrid();
            }
        }

        private void OnRemove(object sender, EventArgs e)
        {
            if (grid.SelectedRows.Count == 0)
            {
                return;
            }

            int index = grid.SelectedRows[0].Index;
            if (index >= 0 && index < paths.Count)
            {
                paths.RemoveAt(index);
                ReloadGrid();
            }
        }
    }
}

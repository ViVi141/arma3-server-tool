using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.Core.Models;
using AntButton = AntdUI.Button;
using AntPanel = AntdUI.Panel;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class ModuleScanPathForm : AntdDialogForm
    {
        private readonly AntTable grid;
        private readonly List<ModuleScanPathEntity> paths;

        public ModuleScanPathForm(IList<ModuleScanPathEntity> initial)
            : base()
        {
            Text = "模组扫描路径";
            ApplyPreferredDialogSizing(760, 420, null);

            paths = new List<ModuleScanPathEntity>();
            if (initial != null)
            {
                paths.AddRange(initial);
            }

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = UiScaleHelper.ScalePadding(8),
            };

            AntButton addButton = SettingsLayoutHelper.CreateButton("添加");
            addButton.Click += OnAdd;
            AntButton removeButton = SettingsLayoutHelper.CreateButton("删除");
            removeButton.Click += OnRemove;
            toolbar.Controls.Add(addButton);
            toolbar.Controls.Add(removeButton);

            grid = AntdTableHelper.CreateStandardTable();
            grid.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.Column("ModulePath", "扫描路径") { Width = "48%", Ellipsis = true },
                new AntdUI.Column("Prefix", "前缀过滤") { Width = "18%" },
                new AntdUI.Column("Remark", "备注") { Width = "34%", Ellipsis = true },
            };
            grid.CellEndEdit += OnScanPathCellEndEdit;

            AntButton okay = AntdUiHelper.CreatePrimaryButton("确定");
            okay.Click += delegate
            {
                DialogResult = DialogResult.OK;
                Close();
            };

            AntButton cancel = AntdUiHelper.CreateToolbarButton("取消");
            cancel.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            Control buttonBar = CreateButtonBar(okay, cancel);

            var filler = new AntPanel { Dock = DockStyle.Fill };
            filler.Controls.Add(grid);

            Controls.Add(buttonBar);
            Controls.Add(toolbar);
            Controls.Add(filler);

            ReloadTable();
        }

        public IList<ModuleScanPathEntity> GetPaths()
        {
            return paths;
        }

        private void ReloadTable()
        {
            grid.DataSource = null;
            AntdTableHelper.BindList(grid, paths);
        }

        private bool OnScanPathCellEndEdit(object sender, AntdUI.TableEndEditEventArgs e)
        {
            var entity = e.Record as ModuleScanPathEntity;
            if (entity == null)
            {
                return true;
            }

            if (e.Column == null || string.IsNullOrEmpty(e.Column.Key))
            {
                return true;
            }

            string key = e.Column.Key;
            string newText;
            if (e.Value == null)
            {
                newText = string.Empty;
            }
            else
            {
                newText = e.Value.Trim();
            }

            if (key == "ModulePath")
            {
                entity.ModulePath = newText;
                return true;
            }

            if (key == "Prefix")
            {
                entity.Prefix = newText;
                return true;
            }

            if (key == "Remark")
            {
                entity.Remark = newText;
                return true;
            }

            return true;
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
                ReloadTable();
            }
        }

        private void OnRemove(object sender, EventArgs e)
        {
            int index = AntdTableHelper.GetSelectedRowIndex(grid);
            if (index < 0 || index >= paths.Count)
            {
                return;
            }

            paths.RemoveAt(index);
            ReloadTable();
        }
    }
}

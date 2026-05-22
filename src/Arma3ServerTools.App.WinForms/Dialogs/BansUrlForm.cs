using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using AntButton = AntdUI.Button;
using AntPanel = AntdUI.Panel;
using AntTable = AntdUI.Table;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class BansUrlForm : AntdDialogForm
    {
        public const string DefaultUrl = "http://tools.destiny.cool/arma3_server_tools/bans.txt";

        private readonly AntTable grid;
        private readonly List<BansUrlEntity> urls;
        private readonly List<BansUrlTableRow> tableRows;

        public BansUrlForm(IList<BansUrlEntity> initial)
            : base()
        {
            Text = "配置共享封禁 URL";
            ApplyPreferredDialogSizing(720, 420, null);

            urls = new List<BansUrlEntity>();
            if (initial != null)
            {
                foreach (BansUrlEntity item in initial)
                {
                    urls.Add(new BansUrlEntity(item.url, item.enable));
                }
            }

            if (urls.Count == 0)
            {
                urls.Add(new BansUrlEntity(DefaultUrl, true));
            }

            tableRows = new List<BansUrlTableRow>();
            foreach (BansUrlEntity entity in urls)
            {
                tableRows.Add(new BansUrlTableRow(entity));
            }

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = UiScaleHelper.ScalePadding(8),
            };

            AntButton addButton = SettingsLayoutHelper.CreateButton("添加 URL");
            addButton.Click += OnAdd;
            toolbar.Controls.Add(addButton);

            AntButton removeButton = SettingsLayoutHelper.CreateButton("删除选中");
            removeButton.Click += OnRemove;
            toolbar.Controls.Add(removeButton);

            grid = AntdTableHelper.CreateStandardTable();
            grid.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.Column("Url", "封禁文件 URL") { Width = "86%", Ellipsis = true, ReadOnly = true },
                new AntdUI.ColumnCheck("Enable", "启用") { Width = "14%", Editable = true },
            };
            grid.CheckedChanged += OnGridCheckedChanged;

            AntButton okay = AntdUiHelper.CreatePrimaryButton("保存");
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

            Control buttonBar = CreateButtonBar(okay, cancel, "保存", "取消");

            var filler = new AntPanel { Dock = DockStyle.Fill };
            filler.Controls.Add(grid);

            Controls.Add(buttonBar);
            Controls.Add(toolbar);
            Controls.Add(filler);

            ReloadTable();
        }

        public IList<BansUrlEntity> GetUrls()
        {
            foreach (BansUrlTableRow row in tableRows)
            {
                row.ApplyEnableToEntity();
            }

            return urls;
        }

        private void ReloadTable()
        {
            foreach (BansUrlTableRow row in tableRows)
            {
                row.SyncFromEntity();
            }

            grid.DataSource = null;
            AntdTableHelper.BindList(grid, tableRows);
        }

        private void SyncTableRowsFromEntities()
        {
            tableRows.Clear();
            foreach (BansUrlEntity entity in urls)
            {
                tableRows.Add(new BansUrlTableRow(entity));
            }
        }

        private void OnGridCheckedChanged(object sender, AntdUI.TableCheckEventArgs e)
        {
            BansUrlTableRow row = e.Record as BansUrlTableRow;
            if (row == null)
            {
                return;
            }

            row.Enable = e.Value;
            row.ApplyEnableToEntity();
        }

        private void OnAdd(object sender, EventArgs e)
        {
            using (var prompt = new TextInputDialog(
                "添加封禁 URL",
                "请输入 bans.txt 的 URL 地址，例如:\n" + DefaultUrl,
                string.Empty))
            {
                if (prompt.ShowDialog(this) != DialogResult.OK)
                {
                    return;
                }

                string url;
                if (prompt.InputText == null)
                {
                    url = string.Empty;
                }
                else
                {
                    url = prompt.InputText.Trim();
                }

                if (string.IsNullOrEmpty(url))
                {
                    return;
                }

                foreach (BansUrlEntity existing in urls)
                {
                    if (string.Equals(existing.url, url, StringComparison.OrdinalIgnoreCase))
                    {
                        AntdUiHelper.ShowError(this, "不能添加重复的 URL。", "错误");
                        return;
                    }
                }

                try
                {
                    Uri uri = new Uri(url);
                    if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
                    {
                        AntdUiHelper.ShowError(this, "地址不正确，请使用 http 或 https。", "错误");
                        return;
                    }
                }
                catch
                {
                    AntdUiHelper.ShowError(this, "地址不正确。", "错误");
                    return;
                }

                urls.Add(new BansUrlEntity(url, true));
                SyncTableRowsFromEntities();
                ReloadTable();
            }
        }

        private void OnRemove(object sender, EventArgs e)
        {
            int index = AntdTableHelper.GetSelectedRowIndex(grid);
            if (index < 0 || index >= tableRows.Count)
            {
                return;
            }

            string url = tableRows[index].Url;
            if (string.Equals(url, DefaultUrl, StringComparison.OrdinalIgnoreCase))
            {
                AntdUiHelper.ShowInfo(this, "默认 URL 无法删除。", "提示");
                return;
            }

            if (!AntdUiHelper.Confirm(this, "确认", "确定删除此共享封禁 URL？\r\n" + url))
            {
                return;
            }

            if (index >= 0 && index < urls.Count)
            {
                urls.RemoveAt(index);
            }

            SyncTableRowsFromEntities();
            ReloadTable();
        }

        private sealed class BansUrlTableRow
        {
            private readonly BansUrlEntity entity;

            public BansUrlTableRow(BansUrlEntity entity)
            {
                this.entity = entity;
            }

            public bool Enable { get; set; }

            public string Url { get; set; }

            public void SyncFromEntity()
            {
                Enable = entity.enable;
                Url = entity.url ?? string.Empty;
            }

            public void ApplyEnableToEntity()
            {
                entity.enable = Enable;
            }
        }
    }
}

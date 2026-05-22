using System;
using System.Collections.Generic;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class BansUrlForm : Form
    {
        public const string DefaultUrl = "http://tools.destiny.cool/arma3_server_tools/bans.txt";

        private readonly DataGridView grid;
        private readonly List<BansUrlEntity> urls;

        public BansUrlForm(IList<BansUrlEntity> initial)
        {
            Text = "配置共享封禁 URL";
            Width = 720;
            Height = 420;
            StartPosition = FormStartPosition.CenterParent;

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

            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(8) };
            var addButton = new Button { Text = "添加 URL", AutoSize = true };
            var removeButton = new Button { Text = "删除选中", AutoSize = true };
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
            grid.Columns.Add("Url", "封禁文件 URL");
            grid.Columns["Url"].ReadOnly = true;
            grid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "Enable", HeaderText = "启用" });

            var okButton = new Button { Text = "保存", DialogResult = DialogResult.OK, Width = 80 };
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

        public IList<BansUrlEntity> GetUrls()
        {
            SyncFromGrid();
            return urls;
        }

        private void ReloadGrid()
        {
            grid.Rows.Clear();
            foreach (BansUrlEntity item in urls)
            {
                grid.Rows.Add(item.url, item.enable);
            }
        }

        private void SyncFromGrid()
        {
            urls.Clear();
            foreach (DataGridViewRow row in grid.Rows)
            {
                if (row.IsNewRow)
                {
                    continue;
                }

                string url = Convert.ToString(row.Cells["Url"].Value);
                bool enable = Convert.ToBoolean(row.Cells["Enable"].Value ?? false);
                urls.Add(new BansUrlEntity(url, enable));
            }
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

                string url = prompt.InputText == null ? string.Empty : prompt.InputText.Trim();
                if (string.IsNullOrEmpty(url))
                {
                    return;
                }

                foreach (BansUrlEntity existing in urls)
                {
                    if (string.Equals(existing.url, url, StringComparison.OrdinalIgnoreCase))
                    {
                        MessageBox.Show("不能添加重复的 URL。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return;
                    }
                }

                try
                {
                    Uri uri = new Uri(url);
                    if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
                    {
                        MessageBox.Show("地址不正确，请使用 http 或 https。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return;
                    }
                }
                catch
                {
                    MessageBox.Show("地址不正确。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                urls.Add(new BansUrlEntity(url, true));
                ReloadGrid();
            }
        }

        private void OnRemove(object sender, EventArgs e)
        {
            if (grid.SelectedRows.Count == 0)
            {
                return;
            }

            string url = Convert.ToString(grid.SelectedRows[0].Cells["Url"].Value);
            if (string.Equals(url, DefaultUrl, StringComparison.OrdinalIgnoreCase))
            {
                MessageBox.Show("默认 URL 无法删除。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            DialogResult confirm = MessageBox.Show(
                "确定删除此共享封禁 URL？\r\n" + url,
                "确认",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);
            if (confirm != DialogResult.Yes)
            {
                return;
            }

            int index = grid.SelectedRows[0].Index;
            if (index >= 0 && index < urls.Count)
            {
                urls.RemoveAt(index);
                ReloadGrid();
            }
        }
    }
}

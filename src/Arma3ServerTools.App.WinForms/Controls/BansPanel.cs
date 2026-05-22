using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class BansPanel : UserControl, IServerSettingsPanel
    {
        private readonly DataGridView localGrid;
        private readonly DataGridView remoteGrid;
        private readonly Button loadLocalButton;
        private readonly Button fetchRemoteButton;
        private readonly Button saveButton;
        private readonly Button mergeButton;
        private readonly Button mergeAllButton;
        private readonly Button manageUrlsButton;
        private readonly Button deleteLocalButton;
        private readonly Button addRemoteButton;

        private readonly BansService bansService;
        private readonly BansUrlRepository bansUrlRepository;
        private ArmaServerConfig boundConfig;
        private List<LocalBansEntity> localBans = new List<LocalBansEntity>();

        public BansPanel()
        {
            Dock = DockStyle.Fill;
            Padding = new Padding(12);

            bansService = AppServices.Instance.BansService;
            bansUrlRepository = AppServices.Instance.BansUrlRepository;

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
            };
            loadLocalButton = new Button { Text = "读取本地", AutoSize = true };
            fetchRemoteButton = new Button { Text = "拉取联合封禁", AutoSize = true };
            manageUrlsButton = new Button { Text = "管理 URL...", AutoSize = true };
            mergeButton = new Button { Text = "合并选中到本地", AutoSize = true };
            mergeAllButton = new Button { Text = "合并全部到本地", AutoSize = true };
            saveButton = new Button { Text = "保存本地封禁", AutoSize = true };
            deleteLocalButton = new Button { Text = "删除本地选中", AutoSize = true };
            addRemoteButton = new Button { Text = "添加远程选中", AutoSize = true };
            loadLocalButton.Click += OnLoadLocal;
            fetchRemoteButton.Click += OnFetchRemote;
            manageUrlsButton.Click += OnManageUrls;
            mergeButton.Click += OnMergeSelected;
            mergeAllButton.Click += OnMergeAll;
            saveButton.Click += OnSaveLocal;
            deleteLocalButton.Click += OnDeleteLocalSelected;
            addRemoteButton.Click += OnAddRemoteSelected;
            toolbar.Controls.Add(loadLocalButton);
            toolbar.Controls.Add(fetchRemoteButton);
            toolbar.Controls.Add(manageUrlsButton);
            toolbar.Controls.Add(mergeButton);
            toolbar.Controls.Add(mergeAllButton);
            toolbar.Controls.Add(addRemoteButton);
            toolbar.Controls.Add(deleteLocalButton);
            toolbar.Controls.Add(saveButton);

            var split = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
                SplitterDistance = 220,
            };

            localGrid = CreateBanGrid(false);
            remoteGrid = CreateBanGrid(true);
            split.Panel1.Controls.Add(WrapGrid("本地封禁", localGrid));
            split.Panel2.Controls.Add(WrapGrid("联合封禁列表", remoteGrid));

            Controls.Add(split);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            localGrid.Rows.Clear();
            remoteGrid.Rows.Clear();
            localBans.Clear();
            if (config == null)
            {
                Enabled = false;
                return;
            }

            Enabled = true;
            OnLoadLocal(this, EventArgs.Empty);
        }

        public void ApplyToModel()
        {
            // 封禁数据写入 bans.txt，不写入 json 配置。
        }

        private static DataGridView CreateBanGrid(bool includeSource)
        {
            var grid = new DataGridView
            {
                Dock = DockStyle.Fill,
                ReadOnly = true,
                AllowUserToAddRows = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            };
            grid.Columns.Add("Guid", "GUID/IP/UID");
            grid.Columns.Add("Time", "到期日期");
            grid.Columns.Add("Reason", "原因");
            if (includeSource)
            {
                grid.Columns.Add("AddTime", "添加日期");
                grid.Columns.Add("Source", "列表来源");
            }

            return grid;
        }

        private static Control WrapGrid(string title, Control grid)
        {
            var group = new GroupBox
            {
                Text = title,
                Dock = DockStyle.Fill,
                Padding = new Padding(8),
            };
            group.Controls.Add(grid);
            return group;
        }

        private void OnLoadLocal(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            localBans = bansService.LoadLocalBans(boundConfig.ServerDir, boundConfig.ServerUUID).ToList();
            localGrid.Rows.Clear();
            foreach (LocalBansEntity ban in localBans)
            {
                localGrid.Rows.Add(ban.GUID, ban.Time, ban.Reason);
            }
        }

        private async void OnFetchRemote(object sender, EventArgs e)
        {
            fetchRemoteButton.Enabled = false;
            try
            {
                List<BansUrlEntity> urls = bansUrlRepository.Load();
                IReadOnlyList<LocalBansEntity> remoteBans = await Task.Run(
                    () => bansService.FetchRemoteBansFromUrls(urls)).ConfigureAwait(true);
                remoteGrid.Rows.Clear();
                foreach (LocalBansEntity ban in remoteBans)
                {
                    remoteGrid.Rows.Add(ban.GUID, ban.Time, ban.Reason, ban.AddTime, ban.SyncName);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "拉取失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                fetchRemoteButton.Enabled = true;
            }
        }

        private void OnManageUrls(object sender, EventArgs e)
        {
            using (var dialog = new BansUrlForm(bansUrlRepository.Load()))
            {
                if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
                {
                    return;
                }

                bansUrlRepository.Save(dialog.GetUrls());
            }
        }

        private void OnMergeSelected(object sender, EventArgs e)
        {
            MergeRemoteRows(false);
        }

        private void OnMergeAll(object sender, EventArgs e)
        {
            MergeRemoteRows(true);
        }

        private void MergeRemoteRows(bool allRows)
        {
            int added = 0;
            IEnumerable<DataGridViewRow> rows;
            if (allRows)
            {
                rows = remoteGrid.Rows.Cast<DataGridViewRow>();
            }
            else
            {
                rows = remoteGrid.SelectedRows.Cast<DataGridViewRow>();
            }

            foreach (DataGridViewRow row in rows)
            {
                if (row.IsNewRow)
                {
                    continue;
                }

                string guid = Convert.ToString(row.Cells["Guid"].Value);
                if (string.IsNullOrEmpty(guid))
                {
                    continue;
                }

                if (localBans.Any(ban => string.Equals(ban.GUID, guid, StringComparison.OrdinalIgnoreCase)))
                {
                    continue;
                }

                var entity = new LocalBansEntity(
                    guid,
                    Convert.ToString(row.Cells["Time"].Value),
                    Convert.ToString(row.Cells["Reason"].Value),
                    string.Empty,
                    string.Empty);
                localBans.Add(entity);
                localGrid.Rows.Add(entity.GUID, entity.Time, entity.Reason);
                added++;
            }

            if (added > 0)
            {
                MessageBox.Show("已合并 " + added + " 条封禁到本地列表，请点击「保存本地封禁」写入文件。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private void OnAddRemoteSelected(object sender, EventArgs e)
        {
            if (remoteGrid.SelectedRows.Count == 0)
            {
                return;
            }

            MergeRemoteRows(false);
            OnSaveLocal(this, EventArgs.Empty);
        }

        private void OnDeleteLocalSelected(object sender, EventArgs e)
        {
            if (localGrid.SelectedRows.Count == 0)
            {
                return;
            }

            foreach (DataGridViewRow row in localGrid.SelectedRows)
            {
                string guid = Convert.ToString(row.Cells["Guid"].Value);
                if (string.IsNullOrEmpty(guid))
                {
                    continue;
                }

                localBans.RemoveAll(ban => string.Equals(ban.GUID, guid, StringComparison.OrdinalIgnoreCase));
                localGrid.Rows.Remove(row);
            }
        }

        private void OnSaveLocal(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            OperationResult result = bansService.SaveLocalBans(boundConfig.ServerDir, boundConfig.ServerUUID, localBans);
            if (result.Success)
            {
                MessageBox.Show("封禁列表已保存。", "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show(result.Message, "失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}

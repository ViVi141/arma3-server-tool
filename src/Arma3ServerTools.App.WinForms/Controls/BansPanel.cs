using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class LocalBanRow
    {
        public string Guid { get; set; } = string.Empty;

        public string Time { get; set; } = string.Empty;

        public string Reason { get; set; } = string.Empty;
    }

    internal sealed class RemoteBanRow
    {
        public string Guid { get; set; } = string.Empty;

        public string Time { get; set; } = string.Empty;

        public string Reason { get; set; } = string.Empty;

        public string AddTime { get; set; } = string.Empty;

        public string Source { get; set; } = string.Empty;
    }

    internal sealed class BansPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntTable localTable;
        private readonly AntTable remoteTable;
        private readonly AntdUI.Button loadLocalButton;
        private readonly AntdUI.Button fetchRemoteButton;
        private readonly AntdUI.Button saveButton;
        private readonly AntdUI.Button mergeButton;
        private readonly AntdUI.Button mergeAllButton;
        private readonly AntdUI.Button manageUrlsButton;
        private readonly AntdUI.Button deleteLocalButton;
        private readonly AntdUI.Button addRemoteButton;

        private readonly BansService bansService;
        private readonly BansUrlRepository bansUrlRepository;
        private ArmaServerConfig boundConfig;
        private readonly List<LocalBanRow> localRows = new List<LocalBanRow>();
        private readonly List<RemoteBanRow> remoteRows = new List<RemoteBanRow>();

        private List<LocalBansEntity> localBans = new List<LocalBansEntity>();

        public BansPanel()
        {
            AppTheme.ApplyTo(this);

            bansService = AppServices.Instance.BansService;
            bansUrlRepository = AppServices.Instance.BansUrlRepository;

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
            };
            loadLocalButton = SettingsLayoutHelper.CreateButton("读取本地");
            fetchRemoteButton = SettingsLayoutHelper.CreateButton("拉取联合封禁");
            manageUrlsButton = SettingsLayoutHelper.CreateButton("管理 URL...");
            mergeButton = SettingsLayoutHelper.CreateButton("合并选中到本地");
            mergeAllButton = SettingsLayoutHelper.CreateButton("合并全部到本地");
            saveButton = SettingsLayoutHelper.CreateButton("保存本地封禁");
            deleteLocalButton = SettingsLayoutHelper.CreateButton("删除本地选中");
            addRemoteButton = SettingsLayoutHelper.CreateButton("添加远程选中");
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

            localTable = CreateLocalBanTable();
            remoteTable = CreateRemoteBanTable();
            remoteTable.MultipleRows = true;

            var split = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
            };
            SplitContainerHelper.BindProportionalSplit(split, 0.48, true, 140, 140);

            split.Panel1.Controls.Add(WrapGridSection("本地封禁", localTable));
            split.Panel2.Controls.Add(WrapGridSection("联合封禁列表", remoteTable));

            Controls.Add(split);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            localRows.Clear();
            remoteRows.Clear();
            localBans.Clear();
            AntdTableHelper.BindList(localTable, localRows);
            AntdTableHelper.BindList(remoteTable, remoteRows);
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
        }

        private static AntTable CreateLocalBanTable()
        {
            AntTable table = AntdTableHelper.CreateStandardTable();
            table.MultipleRows = true;
            table.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.Column("Guid", "GUID/IP/UID") { ReadOnly = true, Width = "34%" },
                new AntdUI.Column("Time", "到期日期") { ReadOnly = true, Width = "22%" },
                new AntdUI.Column("Reason", "原因") { ReadOnly = true, Width = "44%" },
            };
            return table;
        }

        private static AntTable CreateRemoteBanTable()
        {
            AntTable table = AntdTableHelper.CreateStandardTable();
            table.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.Column("Guid", "GUID/IP/UID") { ReadOnly = true, Width = "26%" },
                new AntdUI.Column("Time", "到期日期") { ReadOnly = true, Width = "14%" },
                new AntdUI.Column("Reason", "原因") { ReadOnly = true, Width = "22%" },
                new AntdUI.Column("AddTime", "添加日期") { ReadOnly = true, Width = "14%" },
                new AntdUI.Column("Source", "列表来源") { ReadOnly = true, Width = "24%" },
            };
            return table;
        }

        private static Control WrapGridSection(string title, Control grid)
        {
            grid.Dock = DockStyle.Fill;

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 2,
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            layout.Controls.Add(AntdUiHelper.CreateSectionHeader(title), 0, 0);
            layout.Controls.Add(grid, 0, 1);
            return layout;
        }

        private void OnLoadLocal(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            localBans = bansService.LoadLocalBans(boundConfig.ServerDir, boundConfig.ServerUUID).ToList();
            localRows.Clear();
            foreach (LocalBansEntity ban in localBans)
            {
                localRows.Add(
                    new LocalBanRow
                    {
                        Guid = ban.GUID,
                        Time = ban.Time,
                        Reason = ban.Reason,
                    });
            }

            AntdTableHelper.BindList(localTable, localRows);
        }

        private async void OnFetchRemote(object sender, EventArgs e)
        {
            fetchRemoteButton.Enabled = false;
            try
            {
                List<BansUrlEntity> urls = bansUrlRepository.Load();
                IReadOnlyList<LocalBansEntity> remoteBans = await Task.Run(
                    () => bansService.FetchRemoteBansFromUrls(urls)).ConfigureAwait(true);
                remoteRows.Clear();
                foreach (LocalBansEntity ban in remoteBans)
                {
                    remoteRows.Add(
                        new RemoteBanRow
                        {
                            Guid = ban.GUID,
                            Time = ban.Time,
                            Reason = ban.Reason,
                            AddTime = ban.AddTime,
                            Source = ban.SyncName,
                        });
                }

                AntdTableHelper.BindList(remoteTable, remoteRows);
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "拉取失败");
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
            IEnumerable<RemoteBanRow> enumerate;
            if (allRows)
            {
                enumerate = remoteRows;
            }
            else
            {
                enumerate = GetSelectedRemoteRows();
            }

            int added = 0;
            foreach (RemoteBanRow row in enumerate)
            {
                string guid = row.Guid;
                if (string.IsNullOrEmpty(guid))
                {
                    continue;
                }

                bool exists = false;
                foreach (LocalBansEntity existing in localBans)
                {
                    if (string.Equals(existing.GUID, guid, StringComparison.OrdinalIgnoreCase))
                    {
                        exists = true;
                        break;
                    }
                }

                if (exists)
                {
                    continue;
                }

                var entity = new LocalBansEntity(
                    guid,
                    row.Time,
                    row.Reason,
                    string.Empty,
                    string.Empty);
                localBans.Add(entity);
                localRows.Add(
                    new LocalBanRow
                    {
                        Guid = entity.GUID,
                        Time = entity.Time,
                        Reason = entity.Reason,
                    });
                added++;
            }

            AntdTableHelper.BindList(localTable, localRows);
            if (added > 0)
            {
                AntdUiHelper.ShowInfo(FindForm(), "已合并 " + added + " 条封禁到本地列表，请点击「保存本地封禁」写入文件。", "提示");
            }
        }

        private List<RemoteBanRow> GetSelectedRemoteRows()
        {
            var list = new List<RemoteBanRow>();
            if (remoteTable.MultipleRows && remoteTable.SelectedIndexs != null && remoteTable.SelectedIndexs.Length > 0)
            {
                foreach (int si in remoteTable.SelectedIndexs)
                {
                    int di = si - 1;
                    if (di >= 0 && di < remoteRows.Count)
                    {
                        list.Add(remoteRows[di]);
                    }
                }

                return list;
            }

            int single = AntdTableHelper.GetSelectedRowIndex(remoteTable);
            if (single >= 0 && single < remoteRows.Count)
            {
                list.Add(remoteRows[single]);
            }

            return list;
        }

        private void OnAddRemoteSelected(object sender, EventArgs e)
        {
            if (GetSelectedRemoteRows().Count == 0)
            {
                return;
            }

            MergeRemoteRows(false);
            OnSaveLocal(this, EventArgs.Empty);
        }

        private void OnDeleteLocalSelected(object sender, EventArgs e)
        {
            List<int> indices = GetSelectedLocalIndicesSortedDesc();
            if (indices.Count == 0)
            {
                return;
            }

            foreach (int idx in indices)
            {
                if (idx < 0 || idx >= localRows.Count)
                {
                    continue;
                }

                string guid = localRows[idx].Guid;
                if (!string.IsNullOrEmpty(guid))
                {
                    localBans.RemoveAll(ban => string.Equals(ban.GUID, guid, StringComparison.OrdinalIgnoreCase));
                    localRows.RemoveAt(idx);
                }
            }

            AntdTableHelper.BindList(localTable, localRows);
        }

        private List<int> GetSelectedLocalIndicesSortedDesc()
        {
            var list = new List<int>();
            if (localTable.MultipleRows && localTable.SelectedIndexs != null && localTable.SelectedIndexs.Length > 0)
            {
                foreach (int si in localTable.SelectedIndexs)
                {
                    int di = si - 1;
                    if (di >= 0)
                    {
                        list.Add(di);
                    }
                }
            }
            else
            {
                int single = AntdTableHelper.GetSelectedRowIndex(localTable);
                if (single >= 0)
                {
                    list.Add(single);
                }
            }

            list.Sort();
            list.Reverse();
            return list;
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
                AntdUiHelper.ShowInfo(FindForm(), "封禁列表已保存。", "成功");
            }
            else
            {
                AntdUiHelper.ShowError(FindForm(), result.Message, "失败");
            }
        }
    }
}

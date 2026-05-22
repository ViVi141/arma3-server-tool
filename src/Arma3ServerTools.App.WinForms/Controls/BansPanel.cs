using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using AntLabel = AntdUI.Label;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class LocalBanRow
    {
        public string Guid { get; set; } = string.Empty;

        public string Time { get; set; } = string.Empty;

        public string Reason { get; set; } = string.Empty;
    }

    internal sealed class BansPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntTable localTable;
        private readonly AntdUI.Button addLocalButton;
        private readonly AntdUI.Button loadLocalButton;
        private readonly AntdUI.Button saveButton;
        private readonly AntdUI.Button deleteLocalButton;

        private readonly BansService bansService;
        private ArmaServerConfig boundConfig;
        private readonly List<LocalBanRow> localRows = new List<LocalBanRow>();

        private List<LocalBansEntity> localBans = new List<LocalBansEntity>();

        public BansPanel()
        {
            AppTheme.ApplyTo(this);

            bansService = AppServices.Instance.BansService;

            AntLabel banSystemsHint = AntdUiHelper.CreateHintLabel(
                "本页管理 Arma 本地 bans.txt（写入后需重启服务器或 BattlEye 执行 LoadBans 才会生效）。"
                + " BattlEye 内存封禁与 bans.txt 是两套体系：在线封禁、LoadBans / SaveBans 请在「"
                + UiLabels.RemoteControlTab
                + "」→「BattlEye 封禁」中操作。",
                720);
            banSystemsHint.Dock = DockStyle.Top;
            banSystemsHint.Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(8));

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
            };
            loadLocalButton = SettingsLayoutHelper.CreateButton("读取本地");
            addLocalButton = SettingsLayoutHelper.CreateButton("添加封禁");
            saveButton = SettingsLayoutHelper.CreateButton("保存本地封禁");
            deleteLocalButton = SettingsLayoutHelper.CreateButton("删除选中");
            loadLocalButton.Click += OnLoadLocal;
            addLocalButton.Click += OnAddLocal;
            saveButton.Click += OnSaveLocal;
            deleteLocalButton.Click += OnDeleteLocalSelected;
            toolbar.Controls.Add(loadLocalButton);
            toolbar.Controls.Add(addLocalButton);
            toolbar.Controls.Add(deleteLocalButton);
            toolbar.Controls.Add(saveButton);

            localTable = CreateLocalBanTable();

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 2,
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            layout.Controls.Add(AntdUiHelper.CreateSectionHeader("本地封禁"), 0, 0);
            layout.Controls.Add(localTable, 0, 1);
            localTable.Dock = DockStyle.Fill;

            Controls.Add(layout);
            Controls.Add(toolbar);
            Controls.Add(banSystemsHint);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            localRows.Clear();
            localBans.Clear();
            AntdTableHelper.BindList(localTable, localRows);
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

        private void OnAddLocal(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            using (var dialog = new AddLocalBanForm())
            {
                if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
                {
                    return;
                }

                string message;
                if (!dialog.ValidateInput(FindForm(), out message))
                {
                    return;
                }

                localBans.Add(
                    new LocalBansEntity(
                        dialog.BanGuid,
                        dialog.BanExpiry,
                        dialog.BanReason,
                        string.Empty,
                        string.Empty));
                localRows.Add(
                    new LocalBanRow
                    {
                        Guid = dialog.BanGuid,
                        Time = dialog.BanExpiry,
                        Reason = dialog.BanReason,
                    });
                AntdTableHelper.BindList(localTable, localRows);
            }
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

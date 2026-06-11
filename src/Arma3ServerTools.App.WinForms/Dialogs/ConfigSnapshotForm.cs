using System;
using System.Collections.Generic;
using System.Windows.Forms;
using Arma3ServerTools.Application.Services;
using AntButton = AntdUI.Button;
using AntLabel = AntdUI.Label;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class ConfigSnapshotForm : AntdDialogForm
    {
        private readonly ServerConfigSnapshotService snapshotService;
        private readonly string serverUuid;
        private readonly Action onRestored;
        private readonly AntTable snapshotTable;

        public ConfigSnapshotForm(
            ServerConfigSnapshotService snapshotService,
            string serverUuid,
            string serverName,
            Action onRestored)
            : base()
        {
            this.snapshotService = snapshotService;
            this.serverUuid = serverUuid;
            this.onRestored = onRestored;
            Text = "配置快照 · " + (serverName ?? serverUuid);
            ApplyPreferredDialogSizing(720, 480, null);

            snapshotTable = AntdTableHelper.CreateStandardTable();
            snapshotTable.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.Column("DisplayLabel", "时间 / 说明") { ReadOnly = true, Width = "70%" },
                new AntdUI.Column("SnapshotId", "快照 ID") { ReadOnly = true, Width = "30%", Ellipsis = true },
            };

            AntButton createButton = AntdUiHelper.CreateToolbarButton("立即备份");
            createButton.Click += OnCreateSnapshot;
            AntButton restoreButton = AntdUiHelper.CreatePrimaryButton("恢复选中");
            restoreButton.Click += OnRestoreSnapshot;
            AntButton deleteButton = AntdUiHelper.CreateToolbarButton("删除选中");
            deleteButton.Click += OnDeleteSnapshot;
            AntButton closeButton = AntdUiHelper.CreateToolbarButton("关闭");
            closeButton.Click += delegate { Close(); };

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = UiScaleHelper.ScalePadding(0, 0, 0, 8),
            };
            toolbar.Controls.Add(createButton);
            toolbar.Controls.Add(restoreButton);
            toolbar.Controls.Add(deleteButton);

            AntLabel hint = AntdUiHelper.CreateHintLabel(
                "按「服务器」菜单中的自动快照策略，保存或写入服务器前可自动备份（最多 30 条）。"
                + "恢复后将从磁盘重新加载配置包。",
                640);
            hint.Dock = DockStyle.Top;

            var buttonBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                AutoSize = true,
                Padding = UiScaleHelper.ScalePadding(12, 4, 12, 8),
            };
            buttonBar.Controls.Add(closeButton);

            snapshotTable.Dock = DockStyle.Fill;
            Controls.Add(buttonBar);
            Controls.Add(snapshotTable);
            Controls.Add(toolbar);
            Controls.Add(hint);

            ReloadSnapshots();
        }

        private void ReloadSnapshots()
        {
            IReadOnlyList<ServerConfigSnapshotInfo> snapshots = snapshotService.ListSnapshots(serverUuid);
            var rows = new List<ServerConfigSnapshotInfo>(snapshots.Count);
            for (int i = 0; i < snapshots.Count; i++)
            {
                rows.Add(snapshots[i]);
            }

            AntdTableHelper.BindList(snapshotTable, rows);
        }

        private ServerConfigSnapshotInfo GetSelectedSnapshot()
        {
            List<ServerConfigSnapshotInfo> snapshots = snapshotTable.DataSource as List<ServerConfigSnapshotInfo>;
            if (snapshots == null || snapshots.Count == 0)
            {
                return null;
            }

            int index = AntdTableHelper.GetSelectedRowIndex(snapshotTable);
            if (index < 0 || index >= snapshots.Count)
            {
                return null;
            }

            return snapshots[index];
        }

        private void OnCreateSnapshot(object sender, EventArgs e)
        {
            try
            {
                snapshotService.CreateSnapshot(serverUuid, "手动备份");
                ReloadSnapshots();
                AntdUiHelper.ShowInfo(this, "已创建配置快照。", "成功");
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowWarning(this, ex.Message, "备份失败");
            }
        }

        private void OnRestoreSnapshot(object sender, EventArgs e)
        {
            ServerConfigSnapshotInfo selected = GetSelectedSnapshot();
            if (selected == null)
            {
                AntdUiHelper.ShowWarning(this, "请先选择一条快照。", "提示");
                return;
            }

            if (!AntdUiHelper.Confirm(
                this,
                "恢复配置",
                "确定将配置恢复为「" + selected.DisplayLabel + "」？\n当前未保存的编辑将丢失。"))
            {
                return;
            }

            try
            {
                snapshotService.RestoreSnapshot(serverUuid, selected.SnapshotId);
                if (onRestored != null)
                {
                    onRestored();
                }

                AntdUiHelper.ShowInfo(this, "配置已恢复，界面已重新加载。", "成功");
                DialogResult = DialogResult.OK;
                Close();
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowWarning(this, ex.Message, "恢复失败");
            }
        }

        private void OnDeleteSnapshot(object sender, EventArgs e)
        {
            ServerConfigSnapshotInfo selected = GetSelectedSnapshot();
            if (selected == null)
            {
                AntdUiHelper.ShowWarning(this, "请先选择一条快照。", "提示");
                return;
            }

            if (!AntdUiHelper.Confirm(this, "删除快照", "确定删除该快照？此操作不可撤销。"))
            {
                return;
            }

            snapshotService.DeleteSnapshot(serverUuid, selected.SnapshotId);
            ReloadSnapshots();
        }
    }
}

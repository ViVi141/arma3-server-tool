using System.Collections.Generic;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class CronGridRow
    {
        public string TaskId { get; set; } = string.Empty;

        public string Cron { get; set; } = string.Empty;

        public string ActionText { get; set; } = string.Empty;

        public string Remark { get; set; } = string.Empty;

        public bool Enabled { get; set; }
    }

    internal sealed class CronTasksPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntTable cronTable;
        private readonly AntdUI.Button addButton;
        private readonly AntdUI.Button removeButton;
        private readonly AntdUI.Button syncButton;

        private readonly IAppServices appServices;
        private ArmaServerConfig boundConfig;
        private List<CronGridRow> cronRows = new List<CronGridRow>();

        public CronTasksPanel(IAppServices appServices)
        {
            this.appServices = appServices;
            AppTheme.ApplyTo(this);

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
            };
            addButton = SettingsLayoutHelper.CreateButton("添加任务");
            removeButton = SettingsLayoutHelper.CreateButton("删除任务");
            syncButton = SettingsLayoutHelper.CreateButton("同步到调度器");
            addButton.Click += OnAddTask;
            removeButton.Click += OnRemoveTask;
            syncButton.Click += OnSyncTasks;
            toolbar.Controls.Add(addButton);
            toolbar.Controls.Add(removeButton);
            toolbar.Controls.Add(syncButton);

            cronTable = AntdTableHelper.CreateStandardTable();
            cronTable.MultipleRows = true;
            var enabledCol = new AntdUI.ColumnSwitch("Enabled", "启用");
            cronTable.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.Column("TaskId", "任务 ID") { ReadOnly = true, Width = "18%" },
                new AntdUI.Column("Cron", "Cron 表达式") { Width = "22%" },
                new AntdUI.Column("ActionText", "操作") { Width = "20%" },
                new AntdUI.Column("Remark", "备注") { Width = "22%" },
                enabledCol,
            };

            Controls.Add(cronTable);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            cronRows.Clear();
            if (config == null)
            {
                Enabled = false;
                AntdTableHelper.BindList(cronTable, cronRows);
                return;
            }

            Enabled = true;
            foreach (KeyValuePair<string, CronEntity> pair in config.ServerTaskManagement.CronEntity)
            {
                CronEntity cron = pair.Value;
                if (cron == null)
                {
                    continue;
                }

                bool enabled = false;
                if (cron.Status == 1)
                {
                    enabled = true;
                }

                cronRows.Add(
                    new CronGridRow
                    {
                        TaskId = cron.TaskId,
                        Cron = cron.Cron,
                        ActionText = cron.ActionText,
                        Remark = cron.Remark,
                        Enabled = enabled,
                    });
            }

            AntdTableHelper.BindList(cronTable, cronRows);
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            boundConfig.ServerTaskManagement.CronEntity.Clear();
            foreach (CronGridRow row in cronRows)
            {
                string taskId = row.TaskId;
                if (string.IsNullOrEmpty(taskId))
                {
                    taskId = System.Guid.NewGuid().ToString("N");
                }

                int status = 0;
                if (row.Enabled)
                {
                    status = 1;
                }

                var cron = new CronEntity
                {
                    TaskId = taskId,
                    ServerUUID = boundConfig.ServerUUID,
                    ServerName = boundConfig.ConfigName,
                    Cron = row.Cron,
                    ActionText = row.ActionText,
                    Remark = row.Remark,
                    Status = status,
                    Action = 0,
                };
                boundConfig.ServerTaskManagement.CronEntity[taskId] = cron;
            }
        }

        private void OnAddTask(object sender, System.EventArgs e)
        {
            using (var dialog = new CronTaskDialogForm())
            {
                if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
                {
                    return;
                }

                cronRows.Add(
                    new CronGridRow
                    {
                        TaskId = System.Guid.NewGuid().ToString("N"),
                        Cron = dialog.CronExpression,
                        ActionText = dialog.ActionText,
                        Remark = dialog.Remark,
                        Enabled = dialog.IsTaskEnabled,
                    });
                AntdTableHelper.BindList(cronTable, cronRows);
            }
        }

        private void OnRemoveTask(object sender, System.EventArgs e)
        {
            List<int> indices = GetSelectedDataRowIndicesSortedDesc();
            if (indices.Count == 0)
            {
                return;
            }

            foreach (int idx in indices)
            {
                if (idx >= 0 && idx < cronRows.Count)
                {
                    cronRows.RemoveAt(idx);
                }
            }

            AntdTableHelper.BindList(cronTable, cronRows);
        }

        private List<int> GetSelectedDataRowIndicesSortedDesc()
        {
            var list = new List<int>();
            if (cronTable.MultipleRows && cronTable.SelectedIndexs != null && cronTable.SelectedIndexs.Length > 0)
            {
                foreach (int si in cronTable.SelectedIndexs)
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
                int single = AntdTableHelper.GetSelectedRowIndex(cronTable);
                if (single >= 0)
                {
                    list.Add(single);
                }
            }

            list.Sort();
            list.Reverse();
            return list;
        }

        private async void OnSyncTasks(object sender, System.EventArgs e)
        {
            ApplyToModel();
            if (boundConfig == null)
            {
                return;
            }

            try
            {
                await appServices.SchedulerService
                    .SyncJobsAsync(boundConfig.ServerUUID, boundConfig.ServerTaskManagement.CronEntity)
                    .ConfigureAwait(true);
                AntdUiHelper.ShowInfo(FindForm(), "定时任务已同步。", "成功");
            }
            catch (System.Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), "同步失败: " + ex.Message, "错误");
            }
        }
    }
}

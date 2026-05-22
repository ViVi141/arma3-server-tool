using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class CronTasksPanel : UserControl, IServerSettingsPanel
    {
        private readonly DataGridView cronGrid;
        private readonly Button addButton;
        private readonly Button removeButton;
        private readonly Button syncButton;

        private ArmaServerConfig boundConfig;

        public CronTasksPanel()
        {
            Dock = DockStyle.Fill;
            Padding = new Padding(12);

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
            };
            addButton = new Button { Text = "添加任务", AutoSize = true };
            removeButton = new Button { Text = "删除任务", AutoSize = true };
            syncButton = new Button { Text = "同步到调度器", AutoSize = true };
            addButton.Click += OnAddTask;
            removeButton.Click += OnRemoveTask;
            syncButton.Click += OnSyncTasks;
            toolbar.Controls.Add(addButton);
            toolbar.Controls.Add(removeButton);
            toolbar.Controls.Add(syncButton);

            cronGrid = new DataGridView
            {
                Dock = DockStyle.Fill,
                AllowUserToAddRows = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            };
            cronGrid.Columns.Add("TaskId", "任务 ID");
            cronGrid.Columns.Add("Cron", "Cron 表达式");
            cronGrid.Columns.Add("ActionText", "操作");
            cronGrid.Columns.Add("Remark", "备注");
            cronGrid.Columns.Add("Status", "启用");

            Controls.Add(cronGrid);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            cronGrid.Rows.Clear();
            if (config == null)
            {
                Enabled = false;
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

                cronGrid.Rows.Add(
                    cron.TaskId,
                    cron.Cron,
                    cron.ActionText,
                    cron.Remark,
                    cron.Status == 1 ? "是" : "否");
            }
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            boundConfig.ServerTaskManagement.CronEntity.Clear();
            foreach (DataGridViewRow row in cronGrid.Rows)
            {
                if (row.IsNewRow)
                {
                    continue;
                }

                string taskId = Convert.ToString(row.Cells["TaskId"].Value);
                if (string.IsNullOrEmpty(taskId))
                {
                    taskId = Guid.NewGuid().ToString("N");
                }

                string statusText = Convert.ToString(row.Cells["Status"].Value);
                int status = 0;
                if (statusText == "是")
                {
                    status = 1;
                }

                var cron = new CronEntity
                {
                    TaskId = taskId,
                    ServerUUID = boundConfig.ServerUUID,
                    ServerName = boundConfig.ConfigName,
                    Cron = Convert.ToString(row.Cells["Cron"].Value),
                    ActionText = Convert.ToString(row.Cells["ActionText"].Value),
                    Remark = Convert.ToString(row.Cells["Remark"].Value),
                    Status = status,
                    Action = 0,
                };
                boundConfig.ServerTaskManagement.CronEntity[taskId] = cron;
            }
        }

        private void OnAddTask(object sender, EventArgs e)
        {
            using (var dialog = new CronTaskDialog())
            {
                if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
                {
                    return;
                }

                cronGrid.Rows.Add(
                    Guid.NewGuid().ToString("N"),
                    dialog.CronExpression,
                    dialog.ActionText,
                    dialog.Remark,
                    dialog.IsTaskEnabled ? "是" : "否");
            }
        }

        private void OnRemoveTask(object sender, EventArgs e)
        {
            if (cronGrid.SelectedRows.Count == 0)
            {
                return;
            }

            foreach (DataGridViewRow row in cronGrid.SelectedRows.Cast<DataGridViewRow>().ToArray())
            {
                cronGrid.Rows.Remove(row);
            }
        }

        private async void OnSyncTasks(object sender, EventArgs e)
        {
            ApplyToModel();
            if (boundConfig == null)
            {
                return;
            }

            try
            {
                await AppServices.Instance.SchedulerService
                    .SyncJobsAsync(boundConfig.ServerUUID, boundConfig.ServerTaskManagement.CronEntity)
                    .ConfigureAwait(true);
                MessageBox.Show("定时任务已同步。", "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("同步失败: " + ex.Message, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    internal sealed class CronTaskDialog : Form
    {
        private readonly TextBox cronTextBox;
        private readonly TextBox remarkTextBox;
        private readonly ComboBox actionCombo;
        private readonly CheckBox enabledCheckBox;

        public CronTaskDialog()
        {
            Text = "添加定时任务";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            ClientSize = new System.Drawing.Size(420, 220);

            var layout = SettingsLayoutHelper.CreateFormLayout(100);
            cronTextBox = SettingsLayoutHelper.AddRow(layout, "Cron", new TextBox { Dock = DockStyle.Fill, Text = "0 0 4 * * ?" });
            actionCombo = SettingsLayoutHelper.AddRow(layout, "操作", new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Width = 200,
            });
            actionCombo.Items.Add("重启服务器");
            actionCombo.SelectedIndex = 0;
            remarkTextBox = SettingsLayoutHelper.AddRow(layout, "备注", new TextBox { Dock = DockStyle.Fill });
            enabledCheckBox = SettingsLayoutHelper.AddRow(layout, "启用", new CheckBox { Text = "立即启用", AutoSize = true, Checked = true });
            layout.Dock = DockStyle.Fill;
            layout.Padding = new Padding(12);
            Controls.Add(layout);

            var okButton = new Button { Text = "确定", DialogResult = DialogResult.OK, Width = 80 };
            var cancelButton = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Width = 80 };
            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                Height = 40,
                Padding = new Padding(12, 4, 12, 8),
            };
            buttons.Controls.Add(cancelButton);
            buttons.Controls.Add(okButton);
            Controls.Add(buttons);
            AcceptButton = okButton;
            CancelButton = cancelButton;
        }

        public string CronExpression
        {
            get { return cronTextBox.Text.Trim(); }
        }

        public string ActionText
        {
            get { return Convert.ToString(actionCombo.SelectedItem); }
        }

        public string Remark
        {
            get { return remarkTextBox.Text.Trim(); }
        }

        public bool IsTaskEnabled
        {
            get { return enabledCheckBox.Checked; }
        }
    }
}

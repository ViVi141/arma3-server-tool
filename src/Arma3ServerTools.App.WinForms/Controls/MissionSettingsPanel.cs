using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Missions;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class MissionSettingsPanel : UserControl, IServerSettingsPanel
    {
        private static readonly string[] DifficultyNames = { "新兵", "正常", "老兵", "自定义" };

        private readonly DataGridView missionGrid;
        private readonly ComboBox forcedDifficultyCombo;
        private readonly CheckBox autoSelectCheckBox;
        private readonly CheckBox randomOrderCheckBox;
        private readonly TextBox missionParamsTextBox;
        private readonly Button refreshButton;

        private ArmaServerConfig boundConfig;
        private string selectedMissionTemplate;

        public MissionSettingsPanel()
        {
            Dock = DockStyle.Fill;
            Padding = new Padding(12);

            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            refreshButton = new Button { Text = "刷新任务列表", AutoSize = true };
            refreshButton.Click += delegate { RefreshMissionGrid(); };
            toolbar.Controls.Add(refreshButton);

            missionGrid = new DataGridView
            {
                Dock = DockStyle.Fill,
                AllowUserToAddRows = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            };
            missionGrid.Columns.Add("Template", "任务名称");
            var difficultyColumn = new DataGridViewComboBoxColumn
            {
                Name = "Difficulty",
                HeaderText = "任务难度",
                DataSource = DifficultyNames.ToList(),
            };
            missionGrid.Columns.Add(difficultyColumn);
            missionGrid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "WhiteList", HeaderText = "任务白名单" });
            missionGrid.Columns.Add(new DataGridViewCheckBoxColumn { Name = "Choose", HeaderText = "选用此任务" });
            missionGrid.Columns["Template"].ReadOnly = true;
            missionGrid.SelectionChanged += OnMissionSelectionChanged;

            var optionsLayout = SettingsLayoutHelper.CreateFormLayout(120);
            forcedDifficultyCombo = SettingsLayoutHelper.AddRow(optionsLayout, "强制难度", new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Width = 200,
            });
            forcedDifficultyCombo.Items.AddRange(new object[] { "关闭", "新兵", "正常", "老兵", "自定义" });
            autoSelectCheckBox = SettingsLayoutHelper.AddRow(optionsLayout, "自动选任务", new CheckBox { Text = "autoSelectMission", AutoSize = true });
            randomOrderCheckBox = SettingsLayoutHelper.AddRow(optionsLayout, "随机顺序", new CheckBox { Text = "randomMissionOrder", AutoSize = true });
            missionParamsTextBox = SettingsLayoutHelper.AddRow(optionsLayout, "任务参数", new TextBox
            {
                Multiline = true,
                Height = 80,
                Dock = DockStyle.Fill,
                ScrollBars = ScrollBars.Vertical,
            });

            var bottomSplit = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
                SplitterDistance = 220,
            };
            bottomSplit.Panel1.Controls.Add(missionGrid);
            bottomSplit.Panel2.Controls.Add(SettingsLayoutHelper.CreateScrollHost(optionsLayout));

            Controls.Add(bottomSplit);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            missionGrid.Rows.Clear();
            missionParamsTextBox.Text = string.Empty;
            selectedMissionTemplate = null;
            if (config == null)
            {
                Enabled = false;
                return;
            }

            Enabled = true;
            forcedDifficultyCombo.SelectedIndex = MissionsTool.DifficultyToInt(config.ServerConfig.ForcedDifficulty);
            autoSelectCheckBox.Checked = config.ServerConfig.AutoSelectMission;
            randomOrderCheckBox.Checked = config.ServerConfig.RandomMissionOrder;
            RefreshMissionGrid();
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            SaveCurrentMissionParams();
            boundConfig.ServerConfig.missions.Clear();
            foreach (DataGridViewRow row in missionGrid.Rows)
            {
                if (row.IsNewRow)
                {
                    continue;
                }

                string template = Convert.ToString(row.Cells["Template"].Value);
                string difficultyName = Convert.ToString(row.Cells["Difficulty"].Value);
                bool whiteList = Convert.ToBoolean(row.Cells["WhiteList"].Value ?? false);
                bool choose = Convert.ToBoolean(row.Cells["Choose"].Value ?? false);
                boundConfig.ServerConfig.missions.Add(new MissionsEntity(
                    template,
                    MissionsTool.DifficultyNameToInt(difficultyName),
                    whiteList,
                    choose));
            }

            boundConfig.ServerConfig.ForcedDifficulty = MissionsTool.IntToDifficulty(forcedDifficultyCombo.SelectedIndex);
            boundConfig.ServerConfig.AutoSelectMission = autoSelectCheckBox.Checked;
            boundConfig.ServerConfig.RandomMissionOrder = randomOrderCheckBox.Checked;
        }

        private void RefreshMissionGrid()
        {
            missionGrid.Rows.Clear();
            if (boundConfig == null || string.IsNullOrEmpty(boundConfig.ServerDir))
            {
                return;
            }

            string missionsPath = Path.Combine(boundConfig.ServerDir, "MPMissions");
            List<FileInfo> files = ModFileTools.ListMissionFiles(missionsPath);
            foreach (FileInfo file in files)
            {
                MissionsEntity saved = FindMission(file.Name);
                int difficulty = 3;
                bool whiteList = false;
                bool choose = false;
                if (saved != null)
                {
                    difficulty = saved.Difficulty;
                    whiteList = saved.WhiteList;
                    choose = saved.Choose;
                }

                string difficultyName = DifficultyNames[Math.Min(difficulty, DifficultyNames.Length - 1)];
                missionGrid.Rows.Add(file.Name, difficultyName, whiteList, choose);
            }
        }

        private MissionsEntity FindMission(string template)
        {
            if (boundConfig == null)
            {
                return null;
            }

            foreach (MissionsEntity mission in boundConfig.ServerConfig.missions)
            {
                if (string.Equals(mission.Template, template, StringComparison.OrdinalIgnoreCase))
                {
                    return mission;
                }
            }

            return null;
        }

        private void OnMissionSelectionChanged(object sender, EventArgs e)
        {
            SaveCurrentMissionParams();
            if (missionGrid.SelectedRows.Count == 0)
            {
                selectedMissionTemplate = null;
                missionParamsTextBox.Text = string.Empty;
                return;
            }

            selectedMissionTemplate = Convert.ToString(missionGrid.SelectedRows[0].Cells["Template"].Value);
            string paramsText;
            if (boundConfig != null
                && !string.IsNullOrEmpty(selectedMissionTemplate)
                && boundConfig.MissionParams.TryGetValue(selectedMissionTemplate, out paramsText))
            {
                missionParamsTextBox.Text = paramsText;
            }
            else
            {
                missionParamsTextBox.Text = string.Empty;
            }
        }

        private void SaveCurrentMissionParams()
        {
            if (boundConfig == null || string.IsNullOrEmpty(selectedMissionTemplate))
            {
                return;
            }

            if (boundConfig.MissionParams.ContainsKey(selectedMissionTemplate))
            {
                boundConfig.MissionParams.Remove(selectedMissionTemplate);
            }

            boundConfig.MissionParams.Add(selectedMissionTemplate, missionParamsTextBox.Text);
        }
    }
}

using System;
using System.Collections.Generic;
using System.IO;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Missions;
using Arma3ServerTools.Core.Models;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class MissionGridRow
    {
        public string Template { get; set; } = string.Empty;

        public string Difficulty { get; set; } = string.Empty;

        public bool WhiteList { get; set; }

        public bool Choose { get; set; }
    }

    internal sealed class MissionSettingsPanel : UserControl, IServerSettingsPanel
    {
        private static readonly string[] DifficultyNames = { "新兵", "正常", "老兵", "自定义" };

        private readonly AntTable missionTable;
        private readonly AntdUI.Select forcedDifficultySelect;
        private readonly AntdUI.Checkbox autoSelectCheckBox;
        private readonly AntdUI.Checkbox randomOrderCheckBox;
        private readonly AntdUI.Input missionParamsInput;
        private readonly AntdUI.Button refreshButton;

        private ArmaServerConfig boundConfig;
        private string selectedMissionTemplate = string.Empty;
        private List<MissionGridRow> missionRows = new List<MissionGridRow>();

        public MissionSettingsPanel()
        {
            AppTheme.ApplyTo(this);

            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            refreshButton = SettingsLayoutHelper.CreateButton("刷新任务列表");
            refreshButton.Click += delegate { RefreshMissionGrid(); };
            toolbar.Controls.Add(refreshButton);

            missionTable = AntdTableHelper.CreateStandardTable();
            var difficultyColumn = new AntdUI.ColumnSelect("Difficulty", "任务难度");
            difficultyColumn.Items = new List<AntdUI.SelectItem>();
            for (int i = 0; i < DifficultyNames.Length; i++)
            {
                difficultyColumn.Items.Add(new AntdUI.SelectItem(i, DifficultyNames[i]));
            }

            var whiteCol = new AntdUI.ColumnSwitch("WhiteList", "任务白名单");
            var chooseCol = new AntdUI.ColumnSwitch("Choose", "选用此任务");

            missionTable.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.Column("Template", "任务名称") { ReadOnly = true, Width = "38%" },
                difficultyColumn,
                whiteCol,
                chooseCol,
            };
            missionTable.SelectIndexChanged += OnMissionTableSelectionChanged;

            var optionsLayout = SettingsLayoutHelper.CreateFormLayout(120);
            forcedDifficultySelect = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "强制难度",
                SettingsLayoutHelper.CreateSelect(200, "关闭", "新兵", "正常", "老兵", "自定义"));
            autoSelectCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "自动选任务",
                SettingsLayoutHelper.CreateCheckbox("无人在线时自动切换下一任务", false));
            randomOrderCheckBox = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "随机顺序",
                SettingsLayoutHelper.CreateCheckbox("按随机顺序轮换任务列表", false));
            missionParamsInput = SettingsLayoutHelper.AddRow(
                optionsLayout,
                "任务参数",
                SettingsLayoutHelper.CreateMultilineInput(80));

            var bottomSplit = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Horizontal,
            };
            SplitContainerHelper.BindProportionalSplit(bottomSplit, 0.58, true, 160, 140);
            bottomSplit.Panel1.Controls.Add(missionTable);
            bottomSplit.Panel2.Controls.Add(SettingsLayoutHelper.CreateScrollHost(optionsLayout));

            Controls.Add(bottomSplit);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            missionRows.Clear();
            AntdTableHelper.BindList(missionTable, missionRows);
            missionParamsInput.Text = string.Empty;
            selectedMissionTemplate = string.Empty;
            if (config == null)
            {
                Enabled = false;
                return;
            }

            Enabled = true;
            forcedDifficultySelect.SelectedIndex = MissionsTool.DifficultyToInt(config.ServerConfig.ForcedDifficulty);
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
            foreach (MissionGridRow row in missionRows)
            {
                boundConfig.ServerConfig.missions.Add(
                    new MissionsEntity(
                        row.Template,
                        MissionsTool.DifficultyNameToInt(row.Difficulty),
                        row.WhiteList,
                        row.Choose));
            }

            boundConfig.ServerConfig.ForcedDifficulty = MissionsTool.IntToDifficulty(forcedDifficultySelect.SelectedIndex);
            boundConfig.ServerConfig.AutoSelectMission = autoSelectCheckBox.Checked;
            boundConfig.ServerConfig.RandomMissionOrder = randomOrderCheckBox.Checked;
        }

        private void RefreshMissionGrid()
        {
            if (boundConfig == null || string.IsNullOrEmpty(boundConfig.ServerDir))
            {
                missionRows.Clear();
                AntdTableHelper.BindList(missionTable, missionRows);
                return;
            }

            string missionsPath = Path.Combine(boundConfig.ServerDir, "MPMissions");
            List<FileInfo> files = ModFileTools.ListMissionFiles(missionsPath);
            missionRows.Clear();
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

                int capped = difficulty;
                if (capped > DifficultyNames.Length - 1)
                {
                    capped = DifficultyNames.Length - 1;
                }

                missionRows.Add(
                    new MissionGridRow
                    {
                        Template = file.Name,
                        Difficulty = DifficultyNames[capped],
                        WhiteList = whiteList,
                        Choose = choose,
                    });
            }

            AntdTableHelper.BindList(missionTable, missionRows);
            if (missionRows.Count > 0)
            {
                AntdTableHelper.SelectRowIndex(missionTable, 0);
                selectedMissionTemplate = missionRows[0].Template;
                LoadMissionParamsForTemplate(selectedMissionTemplate);
            }
            else
            {
                selectedMissionTemplate = string.Empty;
                missionParamsInput.Text = string.Empty;
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

        private void OnMissionTableSelectionChanged(object sender, EventArgs e)
        {
            SaveCurrentMissionParams();
            int idx = AntdTableHelper.GetSelectedRowIndex(missionTable);
            if (idx < 0 || idx >= missionRows.Count)
            {
                selectedMissionTemplate = string.Empty;
                missionParamsInput.Text = string.Empty;
                return;
            }

            selectedMissionTemplate = missionRows[idx].Template ?? string.Empty;
            LoadMissionParamsForTemplate(selectedMissionTemplate);
        }

        private void LoadMissionParamsForTemplate(string template)
        {
            string paramsText = string.Empty;
            if (boundConfig != null && !string.IsNullOrEmpty(template) && boundConfig.MissionParams.TryGetValue(template, out string found))
            {
                paramsText = found;
            }

            missionParamsInput.Text = paramsText;
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

            boundConfig.MissionParams.Add(selectedMissionTemplate, missionParamsInput.Text);
        }
    }
}

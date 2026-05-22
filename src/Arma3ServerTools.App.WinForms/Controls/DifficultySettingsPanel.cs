using System.Windows.Forms;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class DifficultySettingsPanel : UserControl, IServerSettingsPanel
    {
        private readonly ComboBox groupIndicatorsCombo;
        private readonly ComboBox friendlyTagsCombo;
        private readonly ComboBox enemyTagsCombo;
        private readonly ComboBox detectedMinesCombo;
        private readonly ComboBox commandsCombo;
        private readonly ComboBox waypointsCombo;
        private readonly CheckBox tacticalPingCheckBox;
        private readonly ComboBox weaponInfoCombo;
        private readonly ComboBox stanceIndicatorCombo;
        private readonly CheckBox staminaBarCheckBox;
        private readonly CheckBox weaponCrosshairCheckBox;
        private readonly CheckBox visionAidCheckBox;
        private readonly ComboBox thirdPersonCombo;
        private readonly CheckBox cameraShakeCheckBox;
        private readonly CheckBox scoreTableCheckBox;
        private readonly CheckBox deathMessagesCheckBox;
        private readonly CheckBox vonIdCheckBox;
        private readonly CheckBox mapContentCheckBox;
        private readonly CheckBox mapContentFriendlyCheckBox;
        private readonly CheckBox mapContentEnemyCheckBox;
        private readonly CheckBox mapContentMinesCheckBox;
        private readonly CheckBox reducedDamageCheckBox;
        private readonly CheckBox autoReportCheckBox;
        private readonly CheckBox multipleSavesCheckBox;
        private readonly NumericUpDown skillAiNumeric;
        private readonly NumericUpDown precisionAiNumeric;

        private ArmaServerConfig boundConfig;

        public DifficultySettingsPanel()
        {
            Dock = DockStyle.Fill;
            var layout = SettingsLayoutHelper.CreateFormLayout(160);
            groupIndicatorsCombo = AddTriStateCombo(layout, "小队指示");
            friendlyTagsCombo = AddTriStateCombo(layout, "友军标签");
            enemyTagsCombo = AddTriStateCombo(layout, "敌军标签");
            detectedMinesCombo = AddTriStateCombo(layout, "地雷范围");
            commandsCombo = AddTriStateCombo(layout, "命令图标");
            waypointsCombo = AddTriStateCombo(layout, "航点");
            tacticalPingCheckBox = SettingsLayoutHelper.AddRow(layout, "战术 Ping", new CheckBox { AutoSize = true });
            weaponInfoCombo = AddTriStateCombo(layout, "武器信息");
            stanceIndicatorCombo = AddTriStateCombo(layout, "姿态指示");
            staminaBarCheckBox = SettingsLayoutHelper.AddRow(layout, "耐力条", new CheckBox { AutoSize = true });
            weaponCrosshairCheckBox = SettingsLayoutHelper.AddRow(layout, "武器准星", new CheckBox { AutoSize = true });
            visionAidCheckBox = SettingsLayoutHelper.AddRow(layout, "视觉辅助", new CheckBox { AutoSize = true });
            thirdPersonCombo = AddTriStateCombo(layout, "第三人称");
            cameraShakeCheckBox = SettingsLayoutHelper.AddRow(layout, "相机摇晃", new CheckBox { AutoSize = true });
            scoreTableCheckBox = SettingsLayoutHelper.AddRow(layout, "得分表", new CheckBox { AutoSize = true });
            deathMessagesCheckBox = SettingsLayoutHelper.AddRow(layout, "死亡消息", new CheckBox { AutoSize = true });
            vonIdCheckBox = SettingsLayoutHelper.AddRow(layout, "VoN ID", new CheckBox { AutoSize = true });
            mapContentCheckBox = SettingsLayoutHelper.AddRow(layout, "扩展地图", new CheckBox { AutoSize = true });
            mapContentFriendlyCheckBox = SettingsLayoutHelper.AddRow(layout, "友军单位", new CheckBox { AutoSize = true });
            mapContentEnemyCheckBox = SettingsLayoutHelper.AddRow(layout, "敌军单位", new CheckBox { AutoSize = true });
            mapContentMinesCheckBox = SettingsLayoutHelper.AddRow(layout, "地图地雷", new CheckBox { AutoSize = true });
            reducedDamageCheckBox = SettingsLayoutHelper.AddRow(layout, "减伤", new CheckBox { AutoSize = true });
            autoReportCheckBox = SettingsLayoutHelper.AddRow(layout, "自动报告", new CheckBox { AutoSize = true });
            multipleSavesCheckBox = SettingsLayoutHelper.AddRow(layout, "多重存档", new CheckBox { AutoSize = true });
            skillAiNumeric = SettingsLayoutHelper.AddRow(layout, "SkillAI", CreateAiNumeric());
            precisionAiNumeric = SettingsLayoutHelper.AddRow(layout, "PrecisionAI", CreateAiNumeric());
            Controls.Add(SettingsLayoutHelper.CreateScrollHost(layout));
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            if (config == null)
            {
                Enabled = false;
                return;
            }

            Enabled = true;
            ServerProfile profile = config.serverProfile;
            groupIndicatorsCombo.SelectedIndex = profile.GroupIndicators;
            friendlyTagsCombo.SelectedIndex = profile.FriendlyTags;
            enemyTagsCombo.SelectedIndex = profile.EnemyTags;
            detectedMinesCombo.SelectedIndex = profile.DetectedMines;
            commandsCombo.SelectedIndex = profile.Commands;
            waypointsCombo.SelectedIndex = profile.WayPoints;
            tacticalPingCheckBox.Checked = profile.TacticalPing == 1;
            weaponInfoCombo.SelectedIndex = profile.WeaponInfo;
            stanceIndicatorCombo.SelectedIndex = profile.StanceIndicator;
            staminaBarCheckBox.Checked = profile.StaminaBar == 1;
            weaponCrosshairCheckBox.Checked = profile.WeaponCrosshair == 1;
            visionAidCheckBox.Checked = profile.VisionAid == 1;
            thirdPersonCombo.SelectedIndex = profile.ThirdPersonView;
            cameraShakeCheckBox.Checked = profile.CameraShake == 1;
            scoreTableCheckBox.Checked = profile.ScoreTable == 1;
            deathMessagesCheckBox.Checked = profile.DeathMessages == 1;
            vonIdCheckBox.Checked = profile.VonID == 1;
            mapContentCheckBox.Checked = profile.MapContent == 1;
            mapContentFriendlyCheckBox.Checked = profile.MapContentFriendly == 1;
            mapContentEnemyCheckBox.Checked = profile.MapContentEnemy == 1;
            mapContentMinesCheckBox.Checked = profile.MapContentMines == 1;
            reducedDamageCheckBox.Checked = profile.ReducedDamage == 1;
            autoReportCheckBox.Checked = profile.AutoReport == 1;
            multipleSavesCheckBox.Checked = profile.MultipleSaves == 1;
            skillAiNumeric.Value = (decimal)profile.SkillAI;
            precisionAiNumeric.Value = (decimal)profile.PrecisionAI;
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            ServerProfile profile = boundConfig.serverProfile;
            profile.GroupIndicators = groupIndicatorsCombo.SelectedIndex;
            profile.FriendlyTags = friendlyTagsCombo.SelectedIndex;
            profile.EnemyTags = enemyTagsCombo.SelectedIndex;
            profile.DetectedMines = detectedMinesCombo.SelectedIndex;
            profile.Commands = commandsCombo.SelectedIndex;
            profile.WayPoints = waypointsCombo.SelectedIndex;
            if (tacticalPingCheckBox.Checked)
            {
                profile.TacticalPing = 1;
            }
            else
            {
                profile.TacticalPing = 0;
            }

            profile.WeaponInfo = weaponInfoCombo.SelectedIndex;
            profile.StanceIndicator = stanceIndicatorCombo.SelectedIndex;
            profile.StaminaBar = ToFlag(staminaBarCheckBox.Checked);
            profile.WeaponCrosshair = ToFlag(weaponCrosshairCheckBox.Checked);
            profile.VisionAid = ToFlag(visionAidCheckBox.Checked);
            profile.ThirdPersonView = thirdPersonCombo.SelectedIndex;
            profile.CameraShake = ToFlag(cameraShakeCheckBox.Checked);
            profile.ScoreTable = ToFlag(scoreTableCheckBox.Checked);
            profile.DeathMessages = ToFlag(deathMessagesCheckBox.Checked);
            profile.VonID = ToFlag(vonIdCheckBox.Checked);
            profile.MapContent = ToFlag(mapContentCheckBox.Checked);
            profile.MapContentFriendly = ToFlag(mapContentFriendlyCheckBox.Checked);
            profile.MapContentEnemy = ToFlag(mapContentEnemyCheckBox.Checked);
            profile.MapContentMines = ToFlag(mapContentMinesCheckBox.Checked);
            profile.ReducedDamage = ToFlag(reducedDamageCheckBox.Checked);
            profile.AutoReport = ToFlag(autoReportCheckBox.Checked);
            profile.MultipleSaves = ToFlag(multipleSavesCheckBox.Checked);
            profile.SkillAI = (double)skillAiNumeric.Value;
            profile.PrecisionAI = (double)precisionAiNumeric.Value;
        }

        private static ComboBox AddTriStateCombo(TableLayoutPanel layout, string label)
        {
            var combo = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 200 };
            combo.Items.AddRange(new object[] { "禁用", "仅友军", "全部" });
            SettingsLayoutHelper.AddRow(layout, label, combo);
            return combo;
        }

        private static NumericUpDown CreateAiNumeric()
        {
            return new NumericUpDown
            {
                Minimum = 0.05m,
                Maximum = 1m,
                DecimalPlaces = 2,
                Increment = 0.05m,
                Value = 0.5m,
                Width = 120,
            };
        }

        private static int ToFlag(bool value)
        {
            if (value)
            {
                return 1;
            }

            return 0;
        }
    }
}

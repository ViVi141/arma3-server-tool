using System.Windows.Forms;
using Arma3ServerTools.Core.Models;
using AntCheckbox = AntdUI.Checkbox;
using AntInputNumber = AntdUI.InputNumber;
using AntSelect = AntdUI.Select;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class DifficultySettingsPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntSelect groupIndicatorsCombo;
        private readonly AntSelect friendlyTagsCombo;
        private readonly AntSelect enemyTagsCombo;
        private readonly AntSelect detectedMinesCombo;
        private readonly AntSelect commandsCombo;
        private readonly AntSelect waypointsCombo;
        private readonly AntCheckbox tacticalPingCheckBox;
        private readonly AntSelect weaponInfoCombo;
        private readonly AntSelect stanceIndicatorCombo;
        private readonly AntCheckbox staminaBarCheckBox;
        private readonly AntCheckbox weaponCrosshairCheckBox;
        private readonly AntCheckbox visionAidCheckBox;
        private readonly AntSelect thirdPersonCombo;
        private readonly AntCheckbox cameraShakeCheckBox;
        private readonly AntCheckbox scoreTableCheckBox;
        private readonly AntCheckbox deathMessagesCheckBox;
        private readonly AntCheckbox vonIdCheckBox;
        private readonly AntCheckbox mapContentCheckBox;
        private readonly AntCheckbox mapContentFriendlyCheckBox;
        private readonly AntCheckbox mapContentEnemyCheckBox;
        private readonly AntCheckbox mapContentMinesCheckBox;
        private readonly AntCheckbox reducedDamageCheckBox;
        private readonly AntCheckbox autoReportCheckBox;
        private readonly AntCheckbox multipleSavesCheckBox;
        private readonly AntInputNumber skillAiNumeric;
        private readonly AntInputNumber precisionAiNumeric;

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
            tacticalPingCheckBox = SettingsLayoutHelper.AddRow(layout, "战术 Ping", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            weaponInfoCombo = AddTriStateCombo(layout, "武器信息");
            stanceIndicatorCombo = AddTriStateCombo(layout, "姿态指示");
            staminaBarCheckBox = SettingsLayoutHelper.AddRow(layout, "耐力条", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            weaponCrosshairCheckBox = SettingsLayoutHelper.AddRow(layout, "武器准星", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            visionAidCheckBox = SettingsLayoutHelper.AddRow(layout, "视觉辅助", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            thirdPersonCombo = AddTriStateCombo(layout, "第三人称");
            cameraShakeCheckBox = SettingsLayoutHelper.AddRow(layout, "相机摇晃", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            scoreTableCheckBox = SettingsLayoutHelper.AddRow(layout, "得分表", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            deathMessagesCheckBox = SettingsLayoutHelper.AddRow(layout, "死亡消息", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            vonIdCheckBox = SettingsLayoutHelper.AddRow(layout, "语音 ID 显示", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            mapContentCheckBox = SettingsLayoutHelper.AddRow(layout, "扩展地图", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            mapContentFriendlyCheckBox = SettingsLayoutHelper.AddRow(layout, "友军单位", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            mapContentEnemyCheckBox = SettingsLayoutHelper.AddRow(layout, "敌军单位", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            mapContentMinesCheckBox = SettingsLayoutHelper.AddRow(layout, "地图地雷", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            reducedDamageCheckBox = SettingsLayoutHelper.AddRow(layout, "减伤", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            autoReportCheckBox = SettingsLayoutHelper.AddRow(layout, "自动报告", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            multipleSavesCheckBox = SettingsLayoutHelper.AddRow(layout, "多重存档", SettingsLayoutHelper.CreateCheckbox(string.Empty, false));
            skillAiNumeric = SettingsLayoutHelper.AddRow(layout, "AI 技能", CreateAiNumeric());
            precisionAiNumeric = SettingsLayoutHelper.AddRow(layout, "AI 精度", CreateAiNumeric());
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

        private static AntSelect AddTriStateCombo(TableLayoutPanel layout, string label)
        {
            AntSelect combo = SettingsLayoutHelper.CreateSelect(200, "禁用", "仅友军", "全部");
            SettingsLayoutHelper.AddRow(layout, label, combo);
            return combo;
        }

        private static AntInputNumber CreateAiNumeric()
        {
            return SettingsLayoutHelper.CreateDecimalNumeric(0.05m, 1m, 0.5m, 120, 2);
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

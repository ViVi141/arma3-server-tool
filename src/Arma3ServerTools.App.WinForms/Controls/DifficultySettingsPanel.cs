using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Core.Models;
using AntCheckbox = AntdUI.Checkbox;
using AntInputNumber = AntdUI.InputNumber;
using AntLabel = AntdUI.Label;
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
            var root = SettingsLayoutHelper.CreateSectionsStack();
            AntLabel hint = AntdUiHelper.CreateHintLabel(
                "对应服务器 Profile 中的 CustomDifficulty 选项（见 Bohemia Wiki「Difficulty Settings」）。"
                + " 三态含义因项而异：小队指示器/名称标签/已发现地雷为「从不 / 有限距离 / 始终」；"
                + "命令/航点/武器信息等为「从不 / 渐隐 / 始终」；第三人为「禁用 / 启用 / 仅载具」。"
                + " 保存并「应用到服务器目录」后写入 *.Arma3Profile。",
                720);
            SettingsLayoutHelper.AddStackSection(root, hint);

            var layout = SettingsLayoutHelper.CreateFormLayout(168);
            groupIndicatorsCombo = AddDistanceTriStateCombo(layout, "小队指示器");
            friendlyTagsCombo = AddDistanceTriStateCombo(layout, "友军名称标签");
            enemyTagsCombo = AddDistanceTriStateCombo(layout, "敌军名称标签");
            detectedMinesCombo = AddDistanceTriStateCombo(layout, "已发现地雷");
            commandsCombo = AddFadeTriStateCombo(layout, "命令图标");
            waypointsCombo = AddFadeTriStateCombo(layout, "航点");
            tacticalPingCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "战术 Ping",
                SettingsLayoutHelper.CreateCheckbox("启用（3D 场景；地图/双显需手动改 Profile）", false));
            weaponInfoCombo = AddFadeTriStateCombo(layout, "武器信息");
            stanceIndicatorCombo = AddFadeTriStateCombo(layout, "姿态指示器");
            staminaBarCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "耐力条",
                SettingsLayoutHelper.CreateCheckbox("显示耐力条", false));
            weaponCrosshairCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "武器准星",
                SettingsLayoutHelper.CreateCheckbox("第一/第三人称均显示武器准星", false));
            visionAidCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "视觉辅助",
                SettingsLayoutHelper.CreateCheckbox("视野内单位辨识（友敌标识）", false));
            thirdPersonCombo = AddThirdPersonCombo(layout, "第三人称视角");
            cameraShakeCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "镜头晃动",
                SettingsLayoutHelper.CreateCheckbox("爆炸/载具附近镜头晃动", false));
            scoreTableCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "计分板",
                SettingsLayoutHelper.CreateCheckbox("显示计分表（击杀/死亡/得分）", false));
            deathMessagesCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "阵亡提示",
                SettingsLayoutHelper.CreateCheckbox("聊天栏显示击杀者（Killed By）", false));
            vonIdCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "VON 通话 ID",
                SettingsLayoutHelper.CreateCheckbox("语音通话时显示发言者", false));
            mapContentCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "扩展地图内容",
                SettingsLayoutHelper.CreateCheckbox("旧版 mapContent 总开关（1.68 前）", false));
            mapContentFriendlyCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "地图友军",
                SettingsLayoutHelper.CreateCheckbox("地图显示友军单位", false));
            mapContentEnemyCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "地图敌军",
                SettingsLayoutHelper.CreateCheckbox("地图显示敌军单位", false));
            mapContentMinesCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "地图地雷",
                SettingsLayoutHelper.CreateCheckbox("地图显示已探测地雷", false));
            reducedDamageCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "降低受伤",
                SettingsLayoutHelper.CreateCheckbox("降低玩家及同组队员所受伤害", false));
            autoReportCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "自动报告接敌",
                SettingsLayoutHelper.CreateCheckbox("玩家发现敌人时自动报告（仅玩家）", false));
            multipleSavesCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "多次保存",
                SettingsLayoutHelper.CreateCheckbox("任务中允许多次存档", false));
            skillAiNumeric = SettingsLayoutHelper.AddRow(layout, "AI 技能 (skillAI)", CreateAiNumeric());
            precisionAiNumeric = SettingsLayoutHelper.AddRow(layout, "AI 射击精度 (precisionAI)", CreateAiNumeric());
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateScrollHost(layout));
            Controls.Add(root);
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

        private static AntSelect AddDistanceTriStateCombo(TableLayoutPanel layout, string label)
        {
            AntSelect combo = SettingsLayoutHelper.CreateSelect(200, "从不", "有限距离", "始终");
            SettingsLayoutHelper.AddRow(layout, label, combo);
            return combo;
        }

        private static AntSelect AddFadeTriStateCombo(TableLayoutPanel layout, string label)
        {
            AntSelect combo = SettingsLayoutHelper.CreateSelect(200, "从不", "渐隐", "始终");
            SettingsLayoutHelper.AddRow(layout, label, combo);
            return combo;
        }

        private static AntSelect AddThirdPersonCombo(TableLayoutPanel layout, string label)
        {
            AntSelect combo = SettingsLayoutHelper.CreateSelect(200, "禁用", "启用", "仅载具");
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

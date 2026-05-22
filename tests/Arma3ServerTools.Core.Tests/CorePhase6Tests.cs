using Arma3ServerTools.Core.Missions;
using Arma3ServerTools.Core.Scheduling;
using Arma3ServerTools.Core.Validation;
using Xunit;

namespace Arma3ServerTools.Core.Tests
{
    public class MissionsToolTests
    {
        [Theory]
        [InlineData("新兵", 0)]
        [InlineData("常规", 1)]
        [InlineData("正常", 1)]
        [InlineData("老兵", 2)]
        [InlineData("自定义", 3)]
        [InlineData("关闭", 4)]
        [InlineData("unknown", 3)]
        public void DifficultyNameToInt_MapsKnownValues(string name, int expected)
        {
            Assert.Equal(expected, MissionsTool.DifficultyNameToInt(name));
        }

        [Theory]
        [InlineData(0, "Recruit")]
        [InlineData(1, "Regular")]
        [InlineData(2, "Veteran")]
        [InlineData(3, "Custom")]
        [InlineData(4, "none")]
        [InlineData(99, "Custom")]
        public void IntToDifficulty_MapsKnownValues(int value, string expected)
        {
            Assert.Equal(expected, MissionsTool.IntToDifficulty(value));
        }

        [Theory]
        [InlineData("Recruit", 0)]
        [InlineData("Regular", 1)]
        [InlineData("Veteran", 2)]
        [InlineData("Custom", 3)]
        [InlineData("none", 4)]
        public void DifficultyToInt_MapsEnglishValues(string name, int expected)
        {
            Assert.Equal(expected, MissionsTool.DifficultyToInt(name));
        }

        [Theory]
        [InlineData(0, "none")]
        [InlineData(1, "Recruit")]
        [InlineData(2, "Regular")]
        [InlineData(3, "Veteran")]
        [InlineData(4, "Custom")]
        [InlineData(-1, "none")]
        [InlineData(99, "none")]
        public void ForcedDifficultyUiToEnglish_MapsUiIndex(int uiIndex, string expected)
        {
            Assert.Equal(expected, MissionsTool.ForcedDifficultyUiToEnglish(uiIndex));
        }

        [Theory]
        [InlineData("none", 0)]
        [InlineData("Recruit", 1)]
        [InlineData("Regular", 2)]
        [InlineData("Veteran", 3)]
        [InlineData("Custom", 4)]
        [InlineData("", 0)]
        [InlineData("unknown", 0)]
        public void ForcedDifficultyEnglishToUiIndex_MapsEnglishValue(string english, int expectedUiIndex)
        {
            Assert.Equal(expectedUiIndex, MissionsTool.ForcedDifficultyEnglishToUiIndex(english));
        }

        [Theory]
        [InlineData("True", true)]
        [InlineData("False", false)]
        [InlineData("", false)]
        public void GetBoolean_ParsesTrueOnly(string value, bool expected)
        {
            Assert.Equal(expected, MissionsTool.GetBoolean(value));
        }
    }

    public class CronTaskToolTests
    {
        [Theory]
        [InlineData(0, "重启服务器")]
        [InlineData(1, "启动服务器")]
        [InlineData(2, "停止服务器")]
        [InlineData(3, "检测并重启")]
        public void ActionToText_MapsKnownActions(int action, string expected)
        {
            Assert.Equal(expected, CronTaskTool.ActionToText(action));
        }

        [Theory]
        [InlineData("重启服务器", 0)]
        [InlineData("启动服务器", 1)]
        [InlineData("停止服务器", 2)]
        [InlineData("检测并重启", 3)]
        [InlineData("", 0)]
        [InlineData("unknown", -1)]
        public void ActionTextToAction_MapsKnownLabels(string text, int expected)
        {
            Assert.Equal(expected, CronTaskTool.ActionTextToAction(text));
        }

        [Theory]
        [InlineData(2, "停止服务器", 2)]
        [InlineData(2, "重启服务器", 0)]
        [InlineData(2, "invalid", 2)]
        public void ResolveAction_PrefersKnownActionText(int storedAction, string actionText, int expected)
        {
            Assert.Equal(expected, CronTaskTool.ResolveAction(storedAction, actionText));
        }
    }

    public class PathValidationTests
    {
        [Theory]
        [InlineData(null, false)]
        [InlineData("", false)]
        [InlineData(@"C:\Arma3\Server", false)]
        [InlineData(@"C:\武装突袭3\Server", true)]
        public void ContainsChinese_DetectsCjkCharacters(string value, bool expected)
        {
            Assert.Equal(expected, PathValidation.ContainsChinese(value));
        }
    }
}

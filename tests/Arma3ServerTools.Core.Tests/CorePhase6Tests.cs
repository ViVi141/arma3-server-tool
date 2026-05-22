using Arma3ServerTools.Core.Missions;
using Arma3ServerTools.Core.Validation;
using Xunit;

namespace Arma3ServerTools.Core.Tests
{
    public class MissionsToolTests
    {
        [Theory]
        [InlineData("新兵", 0)]
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
        [InlineData("True", true)]
        [InlineData("False", false)]
        [InlineData("", false)]
        public void GetBoolean_ParsesTrueOnly(string value, bool expected)
        {
            Assert.Equal(expected, MissionsTool.GetBoolean(value));
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

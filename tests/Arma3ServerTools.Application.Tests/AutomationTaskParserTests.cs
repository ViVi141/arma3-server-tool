using Arma3ServerTools.Application.Automation;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class AutomationTaskParserTests
    {
        [Fact]
        public void TryParseChatCommand_ParsesRestart()
        {
            AutomationTaskDocument task = AutomationTaskParser.TryParseChatCommand("restart", "uuid-1");
            Assert.NotNull(task);
            Assert.Single(task.Commands);
            Assert.Equal("restart", task.Commands[0].Action);
            Assert.Equal("uuid-1", task.ServerUuid);
        }

        [Fact]
        public void TryParseChatCommand_ParsesModsDownload()
        {
            AutomationTaskDocument task = AutomationTaskParser.TryParseChatCommand(
                "mods download 450814997,463939057",
                "uuid-1");
            Assert.NotNull(task);
            Assert.Equal("download_mods", task.Commands[0].Action);
            Assert.Equal(2, task.Commands[0].ModIds.Count);
        }

        [Fact]
        public void ParseJson_RoundTripsCommands()
        {
            string json = "{\"serverUuid\":\"abc\",\"commands\":[{\"action\":\"stop\"}]}";
            AutomationTaskDocument task = AutomationTaskParser.ParseJson(json);
            Assert.Equal("abc", task.ServerUuid);
            Assert.Single(task.Commands);
            Assert.Equal("stop", task.Commands[0].Action);
        }
    }
}

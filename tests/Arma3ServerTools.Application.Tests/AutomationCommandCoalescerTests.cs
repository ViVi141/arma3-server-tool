using System.Collections.Generic;
using Arma3ServerTools.Application.Automation;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class AutomationCommandCoalescerTests
    {
        [Fact]
        public void Coalesce_MergesAdjacentDownloadMods()
        {
            var commands = new List<AutomationCommand>
            {
                new AutomationCommand
                {
                    Action = "download_mods",
                    ModIds = new List<ulong> { 111, 222 },
                },
                new AutomationCommand
                {
                    Action = "download_mods",
                    ModIds = new List<ulong> { 222, 333 },
                },
                new AutomationCommand { Action = "status" },
            };

            List<AutomationCommand> merged = AutomationCommandCoalescer.Coalesce(commands);

            Assert.Equal(2, merged.Count);
            Assert.Equal("download_mods", merged[0].Action);
            Assert.Equal(3, merged[0].ModIds.Count);
            Assert.Equal(2, merged[0].CoalescedFromCount);
            Assert.Equal("status", merged[1].Action);
        }

        [Fact]
        public void Coalesce_MergesDownloadModsSeparatedByPassthrough()
        {
            var commands = new List<AutomationCommand>
            {
                new AutomationCommand
                {
                    Action = "download_mods",
                    ModIds = new List<ulong> { 111 },
                },
                new AutomationCommand { Action = "status" },
                new AutomationCommand
                {
                    Action = "download_mods",
                    ModIds = new List<ulong> { 222 },
                },
            };

            List<AutomationCommand> merged = AutomationCommandCoalescer.Coalesce(commands);

            Assert.Equal(2, merged.Count);
            Assert.Equal("download_mods", merged[0].Action);
            Assert.Equal(2, merged[0].ModIds.Count);
            Assert.Equal(2, merged[0].CoalescedFromCount);
            Assert.Equal("status", merged[1].Action);
        }

        [Fact]
        public void Coalesce_DoesNotMergeDownloadModsAcrossStop()
        {
            var commands = new List<AutomationCommand>
            {
                new AutomationCommand
                {
                    Action = "download_mods",
                    ModIds = new List<ulong> { 111 },
                },
                new AutomationCommand { Action = "stop" },
                new AutomationCommand
                {
                    Action = "download_mods",
                    ModIds = new List<ulong> { 222 },
                },
            };

            List<AutomationCommand> merged = AutomationCommandCoalescer.Coalesce(commands);

            Assert.Equal(3, merged.Count);
            Assert.Equal("download_mods", merged[0].Action);
            Assert.Equal("stop", merged[1].Action);
            Assert.Equal("download_mods", merged[2].Action);
            Assert.Equal(0, merged[0].CoalescedFromCount);
            Assert.Equal(0, merged[2].CoalescedFromCount);
        }

        [Fact]
        public void Coalesce_StripsDownloadModsAfterHtmlImportThatDownloads()
        {
            var commands = new List<AutomationCommand>
            {
                new AutomationCommand
                {
                    Action = "import_mods_html",
                    HtmlContent = "<html></html>",
                    HtmlImportMode = "download_and_enable",
                },
                new AutomationCommand { Action = "status" },
                new AutomationCommand
                {
                    Action = "download_mods",
                    ModIds = new List<ulong> { 111 },
                },
            };

            List<AutomationCommand> merged = AutomationCommandCoalescer.Coalesce(commands);

            Assert.Equal(2, merged.Count);
            Assert.Equal("import_mods_html", merged[0].Action);
            Assert.Equal("status", merged[1].Action);
        }

        [Fact]
        public void Coalesce_KeepsDownloadModsAfterHtmlImportEnableOnly()
        {
            var commands = new List<AutomationCommand>
            {
                new AutomationCommand
                {
                    Action = "import_mods_html",
                    HtmlContent = "<html></html>",
                    HtmlImportMode = "enable",
                },
                new AutomationCommand
                {
                    Action = "download_mods",
                    ModIds = new List<ulong> { 111 },
                },
            };

            List<AutomationCommand> merged = AutomationCommandCoalescer.Coalesce(commands);

            Assert.Equal(2, merged.Count);
            Assert.Equal("import_mods_html", merged[0].Action);
            Assert.Equal("download_mods", merged[1].Action);
        }
    }
}

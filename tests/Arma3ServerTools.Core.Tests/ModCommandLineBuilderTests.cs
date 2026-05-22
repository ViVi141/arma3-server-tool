using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Core.Tests
{
    public class ModCommandLineBuilderTests
    {
        [Fact]
        public void FormatModParameter_ConvertsServerRelativePathToAtToken()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-token");
            try
            {
                string serverDir = Path.Combine(root, "server");
                string modDir = Path.Combine(serverDir, "@cba_a3");
                Directory.CreateDirectory(Path.Combine(modDir, "addons"));

                string formatted = ModCommandLineBuilder.FormatModParameter(serverDir, modDir, "cba_a3");

                Assert.Equal("@cba_a3", formatted);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void BuildModList_SkipsMissingPathsAndDeduplicates()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-dedupe");
            try
            {
                string serverDir = Path.Combine(root, "server");
                string modDir = Path.Combine(serverDir, "ace");
                Directory.CreateDirectory(Path.Combine(modDir, "addons"));

                var entries = new List<ModCommandLineBuilder.ModsEntityModRef>
                {
                    new ModCommandLineBuilder.ModsEntityModRef(modDir, "ace"),
                    new ModCommandLineBuilder.ModsEntityModRef(modDir, "ace"),
                    new ModCommandLineBuilder.ModsEntityModRef(@"D:\missing\mod", "missing"),
                };

                string modList = ModCommandLineBuilder.BuildModList(serverDir, entries);

                Assert.Equal("@ace", modList);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void BuildClientModList_IncludesHeadlessOnlyMods()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-hc");
            try
            {
                string serverDir = Path.Combine(root, "server");
                string hcModDir = Path.Combine(serverDir, "hc_only");
                Directory.CreateDirectory(Path.Combine(hcModDir, "addons"));

                var mods = new List<ModsEntity>
                {
                    new ModsEntity(hcModDir, "hc_only", "HC Only", 0, false, false, true, false),
                };

                string modList = ModCommandLineBuilder.BuildClientModList(serverDir, mods);

                Assert.Equal("@hc_only", modList);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void BuildServerModList_IncludesMonitoringToken()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-monitor");
            try
            {
                string serverDir = Path.Combine(root, "server");
                Directory.CreateDirectory(serverDir);

                string modList = ModCommandLineBuilder.BuildServerModList(serverDir, new List<ModsEntity>(), true);

                Assert.Equal(ToolConstants.MonitoringServerModToken, modList);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }
}

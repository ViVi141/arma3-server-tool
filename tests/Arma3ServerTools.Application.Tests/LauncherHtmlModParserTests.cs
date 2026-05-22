using System.Collections.Generic;
using Arma3ServerTools.Application.Services;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class LauncherHtmlModParserTests
    {
        [Fact]
        public void Parse_ModContainerRow_ExtractsNameAndId()
        {
            string html = "<table>"
                + "<tr data-type=\"ModContainer\">"
                + "<td data-type=\"DisplayName\">CBA_A3</td>"
                + "<td><a href=\"https://steamcommunity.com/sharedfiles/filedetails/?id=450814997\">link</a></td>"
                + "</tr>"
                + "<tr data-type=\"ModContainer\">"
                + "<td data-type=\"DisplayName\">ACE3</td>"
                + "<td><a href=\"https://steamcommunity.com/sharedfiles/filedetails/?id=463939057\">link</a></td>"
                + "</tr>"
                + "</table>";

            List<LauncherHtmlModEntry> mods = LauncherHtmlModParser.Parse(html);

            Assert.Equal(2, mods.Count);
            Assert.Equal(450814997UL, mods[0].ModId);
            Assert.Equal("CBA_A3", mods[0].DisplayName);
            Assert.Equal(463939057UL, mods[1].ModId);
            Assert.Equal("ACE3", mods[1].DisplayName);
            Assert.True(mods[0].Selected);
        }

        [Fact]
        public void Parse_LegacyIdPattern_FallbackWhenNoRows()
        {
            string html = "<div>mod id=450814997 and id=463939057</div>";

            List<LauncherHtmlModEntry> mods = LauncherHtmlModParser.Parse(html);

            Assert.Equal(2, mods.Count);
            Assert.Contains(mods, mod => mod.ModId == 450814997UL);
            Assert.Contains(mods, mod => mod.ModId == 463939057UL);
        }

        [Fact]
        public void Parse_EmptyHtml_ReturnsEmpty()
        {
            Assert.Empty(LauncherHtmlModParser.Parse(string.Empty));
        }
    }
}

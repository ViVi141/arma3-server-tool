using System;
using System.Reflection;
using Arma3ServerTools.Application.Sync;
using Arma3ServerTools.Core;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class UiBehaviorTests
    {
        [Fact]
        public void ConfigSyncStateUi_ReturnsExpectedStatusText()
        {
            Type uiType = GetWinFormsType("Arma3ServerTools.App.WinForms.ConfigSyncStateUi");
            MethodInfo method = uiType.GetMethod(
                "GetStatusText",
                BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Static);

            string unsaved = (string)method.Invoke(null, new object[] { ConfigSyncState.Unsaved, "2026-05-01 12:00" });
            string savedWithTime = (string)method.Invoke(null, new object[] { ConfigSyncState.Saved, "2026-05-01 12:00" });

            Assert.Equal("● 未保存到工具", unsaved);
            Assert.Equal("✓ 已保存到工具 · 2026-05-01 12:00", savedWithTime);
        }

        [Fact]
        public void ConfigSyncStateUi_ReturnsExpectedStatusColor()
        {
            Type uiType = GetWinFormsType("Arma3ServerTools.App.WinForms.ConfigSyncStateUi");
            MethodInfo method = uiType.GetMethod(
                "GetStatusColor",
                BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Static);

            System.Drawing.Color unsaved = (System.Drawing.Color)method.Invoke(null, new object[] { ConfigSyncState.Unsaved });
            System.Drawing.Color saved = (System.Drawing.Color)method.Invoke(null, new object[] { ConfigSyncState.Saved });

            Assert.Equal(System.Drawing.Color.FromArgb(212, 56, 13), unsaved);
            Assert.Equal(System.Drawing.Color.FromArgb(56, 158, 13), saved);
        }

        [Fact]
        public void WizardPathValidation_DetectsChinesePaths()
        {
            Type validationType = GetWinFormsType("Arma3ServerTools.App.WinForms.WizardPathValidation");
            MethodInfo method = validationType.GetMethod(
                "HasInvalidToolPaths",
                BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Static);

            bool hasInvalidChinesePath = (bool)method.Invoke(
                null,
                new object[] { new FakePaths(@"C:\工具\a3st", @"C:\Users\Tester\AppData\Local\Arma3ServerTools") });
            bool hasInvalidUserDataPath = (bool)method.Invoke(
                null,
                new object[] { new FakePaths(@"C:\a3st", @"C:\Users\测试\AppData\Local\Arma3ServerTools") });
            bool hasOnlyEnglishPaths = (bool)method.Invoke(
                null,
                new object[] { new FakePaths(@"C:\a3st", @"C:\Users\Tester\AppData\Local\Arma3ServerTools") });

            Assert.True(hasInvalidChinesePath);
            Assert.True(hasInvalidUserDataPath);
            Assert.False(hasOnlyEnglishPaths);
        }

        private static Type GetWinFormsType(string fullName)
        {
            Assembly assembly = Assembly.Load("Arma3ServerTools");
            Type type = assembly.GetType(fullName, throwOnError: false);
            Assert.NotNull(type);
            return type;
        }

        private sealed class FakePaths : IAppPaths
        {
            public FakePaths(string applicationBase, string userDataDirectory)
            {
                ApplicationBase = applicationBase;
                UserDataDirectory = userDataDirectory;
                ConfigDirectory = userDataDirectory + @"\config";
                LogDirectory = userDataDirectory + @"\logs";
            }

            public string ApplicationBase { get; }

            public string UserDataDirectory { get; }

            public string ConfigDirectory { get; }

            public string LogDirectory { get; }
        }
    }
}

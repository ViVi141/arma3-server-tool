using System.Drawing;

namespace Arma3ServerTools.App.WinForms
{
    internal static class AntdUiBootstrap
    {
        public static void Initialize()
        {
            AppTheme.Initialize();
            AntdUI.Config.Mode = AntdUI.TMode.Light;
            AntdUI.Config.TextRenderingHighQuality = true;
            AntdUI.Config.ShadowEnabled = true;
            AntdUiScrollHelper.RegisterScrollDismissFilter();
        }
    }
}

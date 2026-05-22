using System;
using System.Drawing;
using ScottPlot;

namespace Arma3ServerTools.App.WinForms
{
    internal static class ScottPlotFontHelper
    {
        private static readonly string[] ChineseFontCandidates =
        {
            "Microsoft YaHei UI",
            "Microsoft YaHei",
            "SimHei",
            "PingFang SC",
            "Noto Sans CJK SC",
            "Segoe UI",
        };

        private static string resolvedFontName;

        public static void ApplyToPlot(Plot plot)
        {
            if (plot == null)
            {
                return;
            }

            plot.Font.Set(ResolveFontName());
        }

        private static string ResolveFontName()
        {
            if (!string.IsNullOrEmpty(resolvedFontName))
            {
                return resolvedFontName;
            }

            for (int i = 0; i < ChineseFontCandidates.Length; i++)
            {
                if (IsFontInstalled(ChineseFontCandidates[i]))
                {
                    resolvedFontName = ChineseFontCandidates[i];
                    return resolvedFontName;
                }
            }

            resolvedFontName = "Segoe UI";
            return resolvedFontName;
        }

        private static bool IsFontInstalled(string fontName)
        {
            FontFamily[] families = FontFamily.Families;
            for (int i = 0; i < families.Length; i++)
            {
                if (string.Equals(families[i].Name, fontName, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }
    }
}

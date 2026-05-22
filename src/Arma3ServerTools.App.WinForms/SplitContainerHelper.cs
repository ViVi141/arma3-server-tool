using System;
using System.Windows.Forms;

namespace Arma3ServerTools.App.WinForms
{
    internal static class SplitContainerHelper
    {
        private sealed class SplitRatioTag
        {
            public double Ratio { get; set; }

            public int MinPrimary { get; set; }

            public int MinSecondary { get; set; }

            public bool Horizontal { get; set; }

            public bool UserAdjusted { get; set; }
        }

        public static void BindProportionalSplit(
            SplitContainer split,
            double primaryRatio,
            bool horizontal,
            int logicalMinPrimary,
            int logicalMinSecondary)
        {
            var tag = new SplitRatioTag
            {
                Ratio = primaryRatio,
                Horizontal = horizontal,
                MinPrimary = UiScaleHelper.Scale(logicalMinPrimary),
                MinSecondary = UiScaleHelper.Scale(logicalMinSecondary),
            };
            split.Tag = tag;
            split.SplitterMoved += OnSplitterMoved;
            split.Resize += OnSplitResize;
            ApplyRatio(split);
        }

        public static void ApplyInitialDistance(SplitContainer split, double primaryRatio, bool horizontal)
        {
            int total = GetTotalSize(split, horizontal);
            if (total <= split.SplitterWidth)
            {
                return;
            }

            int distance = (int)Math.Round(total * primaryRatio);
            split.SplitterDistance = ClampDistance(split, distance, horizontal, UiScaleHelper.Scale(160), UiScaleHelper.Scale(160));
        }

        private static void OnSplitterMoved(object sender, SplitterEventArgs e)
        {
            var split = sender as SplitContainer;
            if (split == null)
            {
                return;
            }

            var tag = split.Tag as SplitRatioTag;
            if (tag != null)
            {
                tag.UserAdjusted = true;
            }
        }

        private static void OnSplitResize(object sender, EventArgs e)
        {
            ApplyRatio(sender as SplitContainer);
        }

        private static void ApplyRatio(SplitContainer split)
        {
            if (split == null)
            {
                return;
            }

            var tag = split.Tag as SplitRatioTag;
            if (tag == null || tag.UserAdjusted)
            {
                return;
            }

            int total = GetTotalSize(split, tag.Horizontal);
            if (total <= tag.MinPrimary + tag.MinSecondary + split.SplitterWidth)
            {
                return;
            }

            int distance = (int)Math.Round(total * tag.Ratio);
            split.SplitterDistance = ClampDistance(split, distance, tag.Horizontal, tag.MinPrimary, tag.MinSecondary);
        }

        private static int GetTotalSize(SplitContainer split, bool horizontal)
        {
            if (horizontal)
            {
                return split.Height;
            }

            return split.Width;
        }

        private static int ClampDistance(
            SplitContainer split,
            int distance,
            bool horizontal,
            int minPrimary,
            int minSecondary)
        {
            int total = GetTotalSize(split, horizontal);
            int max = total - minSecondary - split.SplitterWidth;
            if (max < minPrimary)
            {
                return minPrimary;
            }

            if (distance < minPrimary)
            {
                return minPrimary;
            }

            if (distance > max)
            {
                return max;
            }

            return distance;
        }
    }
}

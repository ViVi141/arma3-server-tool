using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Services;
using ScottPlot;
using ScottPlot.WinForms;
using AntLabel = AntdUI.Label;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class StatisticsChartsPanel : UserControl
    {
        private readonly FormsPlot fpsPlot;
        private readonly FormsPlot onlinePlot;
        private readonly FormsPlot killsPlot;
        private readonly AntLabel emptyHint;

        public StatisticsChartsPanel()
        {
            AppTheme.ApplyTo(this);
            Dock = DockStyle.Fill;

            emptyHint = new AntLabel
            {
                Dock = DockStyle.Top,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(8)),
                Text = "暂无快照数据，请启用监控并在服务器运行后刷新统计。",
            };

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 3,
            };
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 34f));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 34f));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 32f));

            fpsPlot = CreatePlot("服务器 FPS 趋势");
            onlinePlot = CreatePlot("在线人数趋势");
            killsPlot = CreatePlot("击杀榜 Top 10");

            layout.Controls.Add(WrapPlot(fpsPlot, "FPS"), 0, 0);
            layout.Controls.Add(WrapPlot(onlinePlot, "在线"), 0, 1);
            layout.Controls.Add(WrapPlot(killsPlot, "击杀"), 0, 2);

            Controls.Add(layout);
            Controls.Add(emptyHint);
        }

        public void RenderCharts(
            IReadOnlyList<MonitoringObjectStatRecord> timelineRows,
            IReadOnlyList<MonitoringPlayerStatRecord> playerRows)
        {
            bool hasTimeline = timelineRows != null && timelineRows.Count > 0;
            bool hasPlayers = playerRows != null && playerRows.Count > 0;
            emptyHint.Visible = !hasTimeline && !hasPlayers;

            RenderTimelineCharts(timelineRows);
            RenderKillChart(playerRows);
        }

        private void RenderTimelineCharts(IReadOnlyList<MonitoringObjectStatRecord> timelineRows)
        {
            ScottPlotFontHelper.ApplyToPlot(fpsPlot.Plot);
            ScottPlotFontHelper.ApplyToPlot(onlinePlot.Plot);
            fpsPlot.Plot.Clear();
            onlinePlot.Plot.Clear();

            if (timelineRows == null || timelineRows.Count == 0)
            {
                fpsPlot.Refresh();
                onlinePlot.Refresh();
                return;
            }

            IReadOnlyList<MonitoringTimelinePoint> points =
                MonitoringChartDataBuilder.BuildTimeline(timelineRows);
            double[] xs = MonitoringChartDataBuilder.ToPlotXs(points);
            double[] fpsYs = MonitoringChartDataBuilder.ToFpsYs(points);
            double[] onlineYs = MonitoringChartDataBuilder.ToOnlineYs(points);

            if (UseIndexAxis(xs))
            {
                xs = BuildIndexAxis(xs.Length);
            }

            fpsPlot.Plot.Add.Scatter(xs, fpsYs).LineWidth = 2;
            fpsPlot.Plot.Axes.Bottom.Label.Text = "时间";
            fpsPlot.Plot.Axes.Left.Label.Text = "FPS";
            fpsPlot.Plot.Title("服务器 FPS 趋势");

            onlinePlot.Plot.Add.Scatter(xs, onlineYs).LineWidth = 2;
            onlinePlot.Plot.Axes.Bottom.Label.Text = "时间";
            onlinePlot.Plot.Axes.Left.Label.Text = "在线人数";
            onlinePlot.Plot.Title("在线人数趋势");

            fpsPlot.Refresh();
            onlinePlot.Refresh();
        }

        private void RenderKillChart(IReadOnlyList<MonitoringPlayerStatRecord> playerRows)
        {
            ScottPlotFontHelper.ApplyToPlot(killsPlot.Plot);
            killsPlot.Plot.Clear();
            if (playerRows == null || playerRows.Count == 0)
            {
                killsPlot.Refresh();
                return;
            }

            IReadOnlyList<MonitoringKillLeaderEntry> leaders =
                MonitoringChartDataBuilder.BuildTopKillLeaders(playerRows, 10);
            if (leaders.Count == 0)
            {
                killsPlot.Refresh();
                return;
            }

            var positions = new double[leaders.Count];
            var values = new double[leaders.Count];
            var labels = new string[leaders.Count];
            for (int i = 0; i < leaders.Count; i++)
            {
                positions[i] = i;
                values[i] = leaders[i].TotalKills;
                labels[i] = leaders[i].PlayerName;
            }

            killsPlot.Plot.Add.Bars(positions, values);
            killsPlot.Plot.Axes.Bottom.TickGenerator =
                new ScottPlot.TickGenerators.NumericManual(
                    BuildTickPositions(positions),
                    labels);
            killsPlot.Plot.Axes.Left.Label.Text = "总击杀";
            killsPlot.Plot.Title("击杀榜 Top 10");
            killsPlot.Refresh();
        }

        private static bool UseIndexAxis(double[] xs)
        {
            if (xs == null || xs.Length == 0)
            {
                return true;
            }

            for (int i = 0; i < xs.Length; i++)
            {
                if (xs[i] > 0)
                {
                    return false;
                }
            }

            return true;
        }

        private static double[] BuildIndexAxis(int length)
        {
            var xs = new double[length];
            for (int i = 0; i < length; i++)
            {
                xs[i] = i;
            }

            return xs;
        }

        private static double[] BuildTickPositions(double[] positions)
        {
            var ticks = new double[positions.Length];
            for (int i = 0; i < positions.Length; i++)
            {
                ticks[i] = positions[i];
            }

            return ticks;
        }

        private static FormsPlot CreatePlot(string title)
        {
            var plot = new FormsPlot
            {
                Dock = DockStyle.Fill,
                MinimumSize = new Size(UiScaleHelper.Scale(240), UiScaleHelper.Scale(160)),
            };
            ScottPlotFontHelper.ApplyToPlot(plot.Plot);
            plot.Plot.Title(title);
            return plot;
        }

        private static Control WrapPlot(FormsPlot plot, string caption)
        {
            var panel = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = UiScaleHelper.ScalePadding(4),
            };
            panel.Controls.Add(plot);
            return panel;
        }
    }
}

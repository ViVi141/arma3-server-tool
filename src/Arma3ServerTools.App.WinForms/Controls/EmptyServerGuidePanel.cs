using System;
using System.Drawing;
using System.Windows.Forms;
using AntButton = AntdUI.Button;
using AntLabel = AntdUI.Label;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class EmptyServerGuidePanel : UserControl
    {
        public event EventHandler FirstServerWizardRequested;

        public event EventHandler NewServerRequested;

        public event EventHandler OpenGuideRequested;

        public EmptyServerGuidePanel()
        {
            AppTheme.ApplyTo(this);
            Dock = DockStyle.Fill;
            BackColor = Color.White;

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 3,
            };
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 35F));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 65F));

            AntLabel title = new AntLabel
            {
                Text = "还没有服务器配置",
                Dock = DockStyle.Bottom,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Font = new Font(Font.FontFamily, Font.Size + 2, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter,
            };

            AntLabel subtitle = AntdUiHelper.CreateHintLabel(
                "首次开服建议从「首服向导」开始，按步骤配置 SteamCMD、专用服务器与基本参数。",
                520);
            subtitle.Dock = DockStyle.Top;
            subtitle.TextAlign = ContentAlignment.MiddleCenter;

            var titleHost = new Panel { Dock = DockStyle.Fill };
            titleHost.Controls.Add(subtitle);
            titleHost.Controls.Add(title);

            var buttons = new FlowLayoutPanel
            {
                AutoSize = true,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                Anchor = AnchorStyles.None,
                Padding = UiScaleHelper.ScalePadding(0, 8, 0, 8),
            };

            AntButton wizardButton = AntdUiHelper.CreatePrimaryButton("首服向导");
            wizardButton.Width = UiScaleHelper.Scale(220);
            wizardButton.Click += delegate
            {
                if (FirstServerWizardRequested != null)
                {
                    FirstServerWizardRequested(this, EventArgs.Empty);
                }
            };

            AntButton newButton = AntdUiHelper.CreateToolbarButton("新建空白配置...");
            newButton.Width = UiScaleHelper.Scale(220);
            newButton.Click += delegate
            {
                if (NewServerRequested != null)
                {
                    NewServerRequested(this, EventArgs.Empty);
                }
            };

            AntButton guideButton = AntdUiHelper.CreateToolbarButton("查看开服指南（记事本）");
            guideButton.Width = UiScaleHelper.Scale(220);
            guideButton.Click += OnOpenGuide;

            buttons.Controls.Add(wizardButton);
            buttons.Controls.Add(newButton);
            buttons.Controls.Add(guideButton);

            AntLabel pathHint = AntdUiHelper.CreateHintLabel(UiLabels.PathRulesHint, 560);
            pathHint.Dock = DockStyle.Top;

            var bottomHost = new Panel { Dock = DockStyle.Fill, Padding = UiScaleHelper.ScalePadding(24, 0, 24, 24) };
            bottomHost.Controls.Add(pathHint);

            layout.Controls.Add(titleHost, 0, 0);
            layout.Controls.Add(buttons, 0, 1);
            layout.Controls.Add(bottomHost, 0, 2);
            Controls.Add(layout);
        }

        private void OnOpenGuide(object sender, EventArgs e)
        {
            if (OpenGuideRequested != null)
            {
                OpenGuideRequested(this, EventArgs.Empty);
                return;
            }

            FirstServerGuideOpener.OpenGuide(FindForm());
        }

        internal static void TryOpenFirstServerGuideDocument()
        {
            FirstServerGuideOpener.OpenGuide(null);
        }
    }
}

using System;
using System.Drawing;
using System.Windows.Forms;
using AntButton = AntdUI.Button;
using AntInput = AntdUI.Input;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;
using AntRadio = AntdUI.Radio;

namespace Arma3ServerTools.App.WinForms
{
    internal static class AntdUiHelper
    {
        public static void ShowInfo(IWin32Window owner, string message, string title)
        {
            Form form = owner as Form;
            if (form != null)
            {
                AntdUI.Message.info(form, message);
                return;
            }

            AntdUI.Modal.open(title, message, AntdUI.TType.Info);
        }

        public static void ShowWarning(IWin32Window owner, string message, string title)
        {
            Form form = owner as Form;
            if (form != null)
            {
                AntdUI.Message.warn(form, message);
                return;
            }

            AntdUI.Modal.open(title, message, AntdUI.TType.Warn);
        }

        public static void ShowError(IWin32Window owner, string message, string title)
        {
            Form form = owner as Form;
            if (form != null)
            {
                AntdUI.Message.error(form, message);
                return;
            }

            AntdUI.Modal.open(title, message, AntdUI.TType.Error);
        }

        public static bool Confirm(IWin32Window owner, string title, string message)
        {
            bool confirmed = false;
            Form form = owner as Form;
            AntdUI.Modal.Config config;
            if (form != null)
            {
                config = new AntdUI.Modal.Config(form, title, message, AntdUI.TType.Warn);
            }
            else
            {
                config = new AntdUI.Modal.Config(title, message, AntdUI.TType.Warn);
            }

            config.OkText = "确定";
            config.CancelText = "取消";
            config.OnOk = delegate
            {
                confirmed = true;
                return true;
            };
            AntdUI.Modal.open(config);
            return confirmed;
        }

        public static AntButton CreateButton(string text, AntdUI.TTypeMini type)
        {
            return new AntButton
            {
                Text = text,
                Type = type,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
            };
        }

        public static AntButton CreateToolbarButton(string text)
        {
            return CreateButton(text, AntdUI.TTypeMini.Default);
        }

        public static AntButton CreateToolbarMenuButton(string text, ContextMenuStrip menu)
        {
            var button = CreateToolbarButton(text);
            button.Margin = new Padding(0, 0, UiScaleHelper.Scale(8), UiScaleHelper.Scale(4));
            button.Click += delegate (object sender, EventArgs e)
            {
                Control control = sender as Control;
                if (control == null)
                {
                    return;
                }

                menu.Show(control, new Point(0, control.Height));
            };
            return button;
        }

        public static AntButton CreatePrimaryButton(string text)
        {
            return CreateButton(text, AntdUI.TTypeMini.Primary);
        }

        public static AntRadio CreateRadio(string text, bool isChecked)
        {
            return new AntRadio
            {
                Text = text,
                AutoSize = true,
                Checked = isChecked,
                Margin = new Padding(0, 0, UiScaleHelper.Scale(16), 0),
            };
        }

        public static AntLabel CreateHintLabel(string text, int logicalMaxWidth)
        {
            return new AntLabel
            {
                Text = text,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                MaximumSize = new Size(UiScaleHelper.Scale(logicalMaxWidth), 0),
                ForeColor = Color.FromArgb(140, 140, 140),
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(6)),
            };
        }

        public static AntLabel CreateSectionHeader(string text)
        {
            return new AntLabel
            {
                Text = text,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                ForeColor = Color.FromArgb(24, 24, 24),
                Font = new Font(AppTheme.UiFont.FontFamily, 10f, FontStyle.Bold),
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(10)),
                Margin = new Padding(0),
            };
        }

        /// <summary>
        /// Ant Design 风格的 Card 区块：浅灰背景 + 边框 + 标题 + 内容，区块间 12px 间距。
        /// </summary>
        public static Control CreateSection(string title, Control content)
        {
            content.Dock = DockStyle.Top;
            content.AutoSize = true;

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                ColumnCount = 1,
                BackColor = Color.White,
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            layout.RowCount = 2;
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.Controls.Add(CreateSectionHeader(title), 0, 0);
            layout.Controls.Add(content, 0, 1);

            var card = new Panel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(
                    UiScaleHelper.Scale(16),
                    UiScaleHelper.Scale(10),
                    UiScaleHelper.Scale(16),
                    UiScaleHelper.Scale(14)),
                Margin = new Padding(0, 0, 0, UiScaleHelper.Scale(12)),
                BackColor = Color.FromArgb(250, 251, 253),
            };
            card.Paint += (_, e) =>
            {
                var rc = card.ClientRectangle;
                rc.Width--;
                rc.Height--;
                using var pen = new Pen(Color.FromArgb(229, 231, 237));
                e.Graphics.DrawRectangle(pen, rc);
            };
            card.Controls.Add(layout);
            return card;
        }

        public static AntdUI.Tabs CreateTabsPanel()
        {
            var tabs = new AntdUI.Tabs
            {
                Dock = DockStyle.Fill,
                Type = AntdUI.TabType.Line,
            };
            ConfigureOverflowTabs(tabs);
            return tabs;
        }

        /// <summary>
        /// 标签页超出宽度时显示左右滚动按钮，避免 Tab 被裁切后无法发现。
        /// </summary>
        public static void ConfigureOverflowTabs(AntdUI.Tabs tabs)
        {
            if (tabs == null)
            {
                return;
            }

            tabs.TypExceed = AntdUI.TabTypExceed.Button;
            tabs.Gap = UiScaleHelper.Scale(4);
            tabs.EnablePageScrolling = true;
            tabs.TabMenuVisible = true;
        }

        public static void AddTabPage(AntdUI.Tabs tabs, string title, Control content)
        {
            content.Dock = DockStyle.Fill;
            var page = new AntdUI.TabPage
            {
                Text = title,
            };
            page.Controls.Add(content);
            tabs.Pages.Add(page);
        }

        public static AntInput CreateDialogInput(string defaultValue)
        {
            return new AntInput
            {
                Text = defaultValue ?? string.Empty,
                Dock = DockStyle.Fill,
            };
        }
    }
}

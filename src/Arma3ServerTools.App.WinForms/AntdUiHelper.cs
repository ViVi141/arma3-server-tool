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
                ForeColor = Color.Gray,
            };
        }

        public static AntLabel CreateSectionHeader(string text)
        {
            return new AntLabel
            {
                Text = text,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                ForeColor = Color.FromArgb(38, 38, 38),
                Font = new Font(AppTheme.UiFont, FontStyle.Bold),
                Padding = new Padding(0, UiScaleHelper.Scale(4), 0, UiScaleHelper.Scale(8)),
                Margin = new Padding(0),
            };
        }

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

            var panel = new Panel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(0, UiScaleHelper.Scale(4), 0, UiScaleHelper.Scale(12)),
                BackColor = Color.White,
            };
            panel.Controls.Add(layout);
            return panel;
        }

        public static AntdUI.Tabs CreateTabsPanel()
        {
            return new AntdUI.Tabs
            {
                Dock = DockStyle.Fill,
                Type = AntdUI.TabType.Line,
            };
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

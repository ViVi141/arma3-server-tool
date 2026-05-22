using System;
using System.Drawing;
using System.Windows.Forms;

namespace Arma3ServerTools.App.WinForms
{
    internal static class AppTheme
    {
        private static Font uiFont;
        private static Padding contentPadding;

        public static Font UiFont
        {
            get
            {
                EnsureInitialized();
                return uiFont;
            }
        }

        public static Padding ContentPadding
        {
            get
            {
                EnsureInitialized();
                return contentPadding;
            }
        }

        public static Color AccentColor
        {
            get { return Color.FromArgb(0, 103, 192); }
        }

        public static Color GridAlternateBackColor
        {
            get { return Color.FromArgb(248, 249, 251); }
        }

        public static Color GridHeaderBackColor
        {
            get { return Color.FromArgb(240, 243, 247); }
        }

        public static Color GridHeaderForeColor
        {
            get { return Color.FromArgb(32, 32, 32); }
        }

        public static Color GridBorderColor
        {
            get { return Color.FromArgb(220, 224, 230); }
        }

        public static void Initialize()
        {
            if (uiFont != null)
            {
                return;
            }

            UiScaleHelper.Initialize();
            uiFont = CreateUiFont();
            contentPadding = UiScaleHelper.ScalePadding(12);
        }

        private static Font CreateUiFont()
        {
            string[] candidates =
            {
                "Microsoft YaHei UI",
                "Microsoft YaHei",
                "SimHei",
                "Segoe UI",
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                try
                {
                    return new Font(candidates[i], 9f, FontStyle.Regular, GraphicsUnit.Point);
                }
                catch (ArgumentException)
                {
                }
            }

            return new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point);
        }

        public static void ApplyTo(Form form)
        {
            EnsureInitialized();
            form.Font = uiFont;
            form.AutoScaleMode = AutoScaleMode.Dpi;
            form.AutoScaleDimensions = new SizeF(96f, 96f);
        }

        public static void ApplyTo(UserControl control)
        {
            EnsureInitialized();
            control.Font = uiFont;
            control.Padding = contentPadding;
        }

        public static void ConfigureDialog(Form form, int logicalMinWidth, int logicalMinHeight, Form owner)
        {
            ApplyTo(form);
            Size preferred = UiScaleHelper.GetPreferredDialogSize(logicalMinWidth, logicalMinHeight, owner);
            form.ClientSize = preferred;
            form.MinimumSize = new Size(UiScaleHelper.Scale(logicalMinWidth), UiScaleHelper.Scale(logicalMinHeight));
            form.StartPosition = FormStartPosition.CenterParent;
        }

        public static void ConfigureMainWindow(Form form, int logicalWidth, int logicalHeight, int logicalMinWidth, int logicalMinHeight)
        {
            ApplyTo(form);
            form.ClientSize = UiScaleHelper.ScaleSize(logicalWidth, logicalHeight);
            form.MinimumSize = UiScaleHelper.ScaleSize(logicalMinWidth, logicalMinHeight);
            form.StartPosition = FormStartPosition.CenterScreen;
        }

        private static void EnsureInitialized()
        {
            if (uiFont == null)
            {
                Initialize();
            }
        }
    }
}

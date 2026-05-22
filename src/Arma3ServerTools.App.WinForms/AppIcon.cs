using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace Arma3ServerTools.App.WinForms
{
    internal static class AppIcon
    {
        public const string RelativePath = "Assets\\1_arma3server_x64.ico";

        private static Icon cachedIcon;
        private static Bitmap cachedBitmap;

        public static Icon GetIcon()
        {
            if (cachedIcon != null)
            {
                return cachedIcon;
            }

            Icon fromExecutable = TryExtractFromExecutable();
            if (fromExecutable != null)
            {
                cachedIcon = fromExecutable;
                return cachedIcon;
            }

            cachedIcon = LoadFromAssetsFile();
            return cachedIcon;
        }

        public static Bitmap GetBitmap()
        {
            if (cachedBitmap != null)
            {
                return cachedBitmap;
            }

            Icon icon = GetIcon();
            if (icon == null)
            {
                return null;
            }

            cachedBitmap = new Bitmap(icon.ToBitmap());
            return cachedBitmap;
        }

        public static void ApplyTo(Form form)
        {
            if (form == null)
            {
                return;
            }

            Icon icon = GetIcon();
            if (icon != null)
            {
                form.Icon = icon;
            }
        }

        public static void ApplyTo(AntdUI.PageHeader header)
        {
            if (header == null)
            {
                return;
            }

            Bitmap bitmap = GetBitmap();
            if (bitmap == null)
            {
                return;
            }

            header.ShowIcon = true;
            header.Icon = bitmap;
        }

        private static Icon TryExtractFromExecutable()
        {
            try
            {
                string executablePath = System.Windows.Forms.Application.ExecutablePath;
                if (string.IsNullOrWhiteSpace(executablePath))
                {
                    return null;
                }

                return Icon.ExtractAssociatedIcon(executablePath);
            }
            catch (Exception)
            {
                return null;
            }
        }

        private static Icon LoadFromAssetsFile()
        {
            try
            {
                string iconPath = Path.Combine(AppContext.BaseDirectory, RelativePath);
                if (!File.Exists(iconPath))
                {
                    return null;
                }

                using (FileStream stream = File.OpenRead(iconPath))
                {
                    return new Icon(stream);
                }
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}

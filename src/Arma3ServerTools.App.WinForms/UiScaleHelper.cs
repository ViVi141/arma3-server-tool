using System;
using System.Drawing;
using System.Windows.Forms;
using System.Reflection;

namespace Arma3ServerTools.App.WinForms
{
    internal static class UiScaleHelper
    {
        private static float scaleFactor = 1f;
        private static bool initialized;

        public static float ScaleFactor
        {
            get
            {
                EnsureInitialized();
                return scaleFactor;
            }
        }

        public static void Initialize()
        {
            if (initialized)
            {
                return;
            }

            // 当 ApplicationHighDpiMode 为 PerMonitorV2 时，WinForms 已自动处理 DPI 缩放。
            // 手动 Scale 会导致双重缩放（控件被放大两次），高 DPI 下 UI 超出屏幕。
            // 检测方式是读取 .csproj 中 <ApplicationHighDpiMode> 生成的程序集属性。
            if (IsWinFormsAutoScalingEnabled())
            {
                scaleFactor = 1.0f;
            }
            else
            {
                using (Graphics graphics = Graphics.FromHwnd(IntPtr.Zero))
                {
                    scaleFactor = graphics.DpiX / 96f;
                }
            }

            if (scaleFactor < 1f)
            {
                scaleFactor = 1f;
            }

            initialized = true;
        }

        private static bool IsWinFormsAutoScalingEnabled()
        {
            // 读取 <ApplicationHighDpiMode> 程序集级属性
            try
            {
                Assembly entryAssembly = Assembly.GetEntryAssembly();
                if (entryAssembly == null)
                    return false;
                object[] attrs = entryAssembly.GetCustomAttributes(true);
                foreach (object attr in attrs)
                {
                    string typeName = attr.GetType().FullName;
                    if (typeName != null && typeName.Contains("ApplicationHighDpiModeAttribute"))
                        return true;
                }
            }
            catch
            {
            }

            return false;
        }

        public static int Scale(int logicalPixels)
        {
            EnsureInitialized();
            return (int)Math.Round(logicalPixels * scaleFactor);
        }

        public static Size ScaleSize(int width, int height)
        {
            return new Size(Scale(width), Scale(height));
        }

        public static Padding ScalePadding(int all)
        {
            int scaled = Scale(all);
            return new Padding(scaled);
        }

        public static Padding ScalePadding(int horizontal, int vertical)
        {
            return new Padding(Scale(horizontal), Scale(vertical), Scale(horizontal), Scale(vertical));
        }

        public static Padding ScalePadding(int left, int top, int right, int bottom)
        {
            return new Padding(Scale(left), Scale(top), Scale(right), Scale(bottom));
        }

        public static Size GetPreferredDialogSize(int logicalWidth, int logicalHeight, Form owner)
        {
            Size scaled = ScaleSize(logicalWidth, logicalHeight);
            Screen screen = ResolveScreen(owner);
            Rectangle workingArea = screen.WorkingArea;
            int width = Math.Min(scaled.Width, (int)(workingArea.Width * 0.92));
            int height = Math.Min(scaled.Height, (int)(workingArea.Height * 0.88));
            return new Size(Math.Max(width, Scale(480)), Math.Max(height, Scale(320)));
        }

        private static Screen ResolveScreen(Form owner)
        {
            if (owner != null)
            {
                return Screen.FromControl(owner);
            }

            if (Form.ActiveForm != null)
            {
                return Screen.FromControl(Form.ActiveForm);
            }

            return Screen.PrimaryScreen;
        }

        private static void EnsureInitialized()
        {
            if (!initialized)
            {
                Initialize();
            }
        }
    }
}
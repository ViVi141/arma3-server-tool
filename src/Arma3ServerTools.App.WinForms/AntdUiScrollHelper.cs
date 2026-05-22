using System;
using System.Reflection;
using System.Windows.Forms;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms
{
    internal static class AntdUiScrollHelper
    {
        public static void RegisterScrollDismissFilter()
        {
            System.Windows.Forms.Application.AddMessageFilter(new ScrollDismissMessageFilter());
        }

        public static bool ContainsFloatingPopup(Control root)
        {
            return FindFloatingPopupControl(root) != null;
        }

        public static void CloseAnchoredPopups(Control root)
        {
            CloseExpandDropControls(root);
            CloseTableEditors(root);
        }

        public static SettingsScrollPanel FindSettingsScrollHost(Control control)
        {
            Control current = control;
            while (current != null)
            {
                SettingsScrollPanel scrollHost = current as SettingsScrollPanel;
                if (scrollHost != null)
                {
                    return scrollHost;
                }

                current = current.Parent;
            }

            return null;
        }

        public static bool IsLayeredPopupRoot(Control control)
        {
            Control current = control;
            while (current != null)
            {
                Form form = current as Form;
                if (form != null)
                {
                    string typeName = form.GetType().Name;
                    if (typeName.StartsWith("LayeredForm", StringComparison.Ordinal))
                    {
                        return true;
                    }
                }

                current = current.Parent;
            }

            return false;
        }

        private static Control FindFloatingPopupControl(Control root)
        {
            if (IsExpandDropOpen(root))
            {
                return root;
            }

            foreach (Control child in root.Controls)
            {
                Control match = FindFloatingPopupControl(child);
                if (match != null)
                {
                    return match;
                }
            }

            return null;
        }

        private static void CloseExpandDropControls(Control root)
        {
            TryCloseExpandDrop(root);
            foreach (Control child in root.Controls)
            {
                CloseExpandDropControls(child);
            }
        }

        private static void CloseTableEditors(Control root)
        {
            AntTable table = root as AntTable;
            if (table != null)
            {
                table.EditModeClose();
            }

            foreach (Control child in root.Controls)
            {
                CloseTableEditors(child);
            }
        }

        private static bool TryCloseExpandDrop(Control control)
        {
            if (!IsExpandDropOpen(control))
            {
                return false;
            }

            PropertyInfo property = control.GetType().GetProperty(
                "ExpandDrop",
                BindingFlags.Instance | BindingFlags.Public);
            if (property == null)
            {
                return false;
            }

            if (!property.CanWrite)
            {
                return false;
            }

            property.SetValue(control, false, null);
            return true;
        }

        private static bool IsExpandDropOpen(Control control)
        {
            PropertyInfo property = control.GetType().GetProperty(
                "ExpandDrop",
                BindingFlags.Instance | BindingFlags.Public);
            if (property == null)
            {
                return false;
            }

            if (!property.CanRead)
            {
                return false;
            }

            object value = property.GetValue(control, null);
            if (value is bool expanded)
            {
                return expanded;
            }

            return false;
        }

        private sealed class ScrollDismissMessageFilter : IMessageFilter
        {
            private const int WmMouseWheel = 0x20A;
            private const int WmVScroll = 0x115;
            private const int WmHScroll = 0x114;

            public bool PreFilterMessage(ref Message message)
            {
                if (message.Msg != WmMouseWheel
                    && message.Msg != WmVScroll
                    && message.Msg != WmHScroll)
                {
                    return false;
                }

                Control target = Control.FromHandle(message.HWnd);
                if (target == null)
                {
                    return false;
                }

                if (IsLayeredPopupRoot(target))
                {
                    return false;
                }

                SettingsScrollPanel scrollHost = FindSettingsScrollHost(target);
                if (scrollHost == null)
                {
                    return false;
                }

                if (!ContainsFloatingPopup(scrollHost.Content))
                {
                    return false;
                }

                CloseAnchoredPopups(scrollHost.Content);
                return false;
            }
        }
    }
}

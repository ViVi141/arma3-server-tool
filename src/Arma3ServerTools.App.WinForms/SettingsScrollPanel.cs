using System.Drawing;
using System.Windows.Forms;

namespace Arma3ServerTools.App.WinForms
{
    internal sealed class SettingsScrollPanel : Panel
    {
        private const int WmMouseWheel = 0x20A;
        private const int WmVScroll = 0x115;
        private const int WmHScroll = 0x114;

        private Control content;

        public SettingsScrollPanel()
        {
            AutoScroll = true;
            BackColor = Color.White;
        }

        public Control Content
        {
            get { return content; }
        }

        public void AttachContent(Control scrollContent)
        {
            content = scrollContent;
            content.Dock = DockStyle.Top;
            content.AutoSize = true;
            Controls.Add(content);
            content.Layout += OnContentLayout;
            Resize += OnScrollPanelResize;
            SyncContentSize();
        }

        public bool ContainsFloatingPopup()
        {
            if (content == null)
            {
                return false;
            }

            return AntdUiScrollHelper.ContainsFloatingPopup(content);
        }

        protected override void WndProc(ref Message message)
        {
            if (IsScrollMessage(message.Msg))
            {
                DismissFloatingPopupsIfNeeded();
            }

            base.WndProc(ref message);
        }

        private void OnScrollPanelResize(object sender, System.EventArgs e)
        {
            SyncContentSize();
        }

        private void OnContentLayout(object sender, LayoutEventArgs e)
        {
            SyncContentSize();
        }

        private void SyncContentSize()
        {
            if (content == null)
            {
                return;
            }

            int width = ClientSize.Width - Padding.Left - Padding.Right;
            if (width > 0 && content.Width != width)
            {
                content.Width = width;
            }

            content.PerformLayout();
            Size preferred = content.GetPreferredSize(new Size(content.Width, 0));
            if (preferred.Height > 0 && content.Height != preferred.Height)
            {
                content.Height = preferred.Height;
            }
        }

        private void DismissFloatingPopupsIfNeeded()
        {
            if (content == null)
            {
                return;
            }

            if (!AntdUiScrollHelper.ContainsFloatingPopup(content))
            {
                return;
            }

            AntdUiScrollHelper.CloseAnchoredPopups(content);
        }

        private static bool IsScrollMessage(int message)
        {
            if (message == WmMouseWheel)
            {
                return true;
            }

            if (message == WmVScroll)
            {
                return true;
            }

            if (message == WmHScroll)
            {
                return true;
            }

            return false;
        }
    }
}

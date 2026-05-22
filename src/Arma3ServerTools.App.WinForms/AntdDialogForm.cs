using System.Drawing;
using System.Windows.Forms;
using AntButton = AntdUI.Button;
using AntPanel = AntdUI.Panel;

namespace Arma3ServerTools.App.WinForms
{
    internal class AntdDialogForm : AntdUI.Window
    {
        protected AntdDialogForm()
        {
            AppTheme.ApplyTo(this);
            AppIcon.ApplyTo(this);
            StartPosition = FormStartPosition.CenterParent;
            MaximizeBox = false;
            MinimizeBox = false;
            BackColor = Color.White;
        }

        protected AntdDialogForm(string title, Size logicalClientSize)
            : this()
        {
            Text = title;
            ClientSize = UiScaleHelper.ScaleSize(logicalClientSize.Width, logicalClientSize.Height);
        }

        protected void ApplyPreferredDialogSizing(int logicalWidth, int logicalHeight, Form ownerForm)
        {
            ClientSize = UiScaleHelper.GetPreferredDialogSize(logicalWidth, logicalHeight, ownerForm);
            MinimumSize = UiScaleHelper.ScaleSize(logicalWidth, logicalHeight);
        }

        protected void ApplyPreferredDialogSizing(int logicalWidth, int logicalHeight, int logicalMinHeight, Form ownerForm)
        {
            ClientSize = UiScaleHelper.GetPreferredDialogSize(logicalWidth, logicalHeight, ownerForm);
            MinimumSize = UiScaleHelper.ScaleSize(logicalWidth, logicalMinHeight);
        }

        protected AntdUI.PageHeader CreateDialogHeader(string title)
        {
            Text = title;
            var header = new AntdUI.PageHeader
            {
                Text = title,
                Dock = DockStyle.Top,
                ShowButton = true,
                ShowIcon = true,
                CancelButton = true,
                MaximizeBox = false,
                MinimizeBox = false,
                FullBox = false,
                DragMove = true,
                DividerShow = true,
                UseTitleFont = true,
                UseTextBold = true,
                CloseSize = UiScaleHelper.Scale(40),
                Height = UiScaleHelper.Scale(40),
            };
            AppIcon.ApplyTo(header);
            return header;
        }

        protected void MountDialogLayout(Control body, Control buttonBar, AntdUI.PageHeader header)
        {
            body.Dock = DockStyle.Fill;
            Controls.Add(body);
            if (buttonBar != null)
            {
                buttonBar.Dock = DockStyle.Bottom;
                Controls.Add(buttonBar);
            }

            Controls.Add(header);
        }

        protected FlowLayoutPanel CreateButtonBar(AntButton okButton, AntButton cancelButton)
        {
            return CreateButtonBar(okButton, cancelButton, "确定", "取消");
        }

        protected FlowLayoutPanel CreateButtonBar(AntButton okButton, AntButton cancelButton, string okText, string cancelText)
        {
            okButton.Text = okText;
            cancelButton.Text = cancelText;
            okButton.Type = AntdUI.TTypeMini.Primary;

            var bar = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                AutoSize = true,
                Padding = new Padding(
                    UiScaleHelper.Scale(12),
                    UiScaleHelper.Scale(4),
                    UiScaleHelper.Scale(12),
                    UiScaleHelper.Scale(8)),
            };
            bar.Controls.Add(cancelButton);
            bar.Controls.Add(okButton);
            return bar;
        }

        protected void WireDialogButtons(AntButton okButton, AntButton cancelButton)
        {
            okButton.Click += delegate
            {
                DialogResult = DialogResult.OK;
                Close();
            };
            cancelButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };
        }
    }
}

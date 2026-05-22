using System.Drawing;
using System.Windows.Forms;
using AntButton = AntdUI.Button;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class RewardQrPreviewForm : AntdDialogForm
    {
        public RewardQrPreviewForm(Form owner, string title, Image image)
            : base()
        {
            int logicalImageSize = 480;
            int logicalWidth = logicalImageSize + 80;
            int logicalHeight = logicalImageSize + 140;
            ApplyPreferredDialogSizing(logicalWidth, logicalHeight, logicalWidth, owner);

            AntdUI.PageHeader header = CreateDialogHeader(title);

            var picture = new PictureBox
            {
                Dock = DockStyle.Fill,
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.White,
                Image = image,
            };

            AntButton closeButton = AntdUiHelper.CreatePrimaryButton("关闭");
            closeButton.Click += delegate
            {
                DialogResult = DialogResult.OK;
                Close();
            };

            var buttonBar = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.RightToLeft,
                AutoSize = true,
                Padding = UiScaleHelper.ScalePadding(12, 4, 12, 10),
            };
            buttonBar.Controls.Add(closeButton);

            var body = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = UiScaleHelper.ScalePadding(12, 8, 12, 4),
            };
            picture.Dock = DockStyle.Fill;
            body.Controls.Add(picture);

            MountDialogLayout(body, buttonBar, header);
        }
    }
}

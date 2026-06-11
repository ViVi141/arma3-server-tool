using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using AntButton = AntdUI.Button;
using AntInput = AntdUI.Input;
using AntPanel = AntdUI.Panel;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class TextInputDialog : AntdDialogForm
    {
        private readonly AntInput input;

        public TextInputDialog(string title, string label, string defaultValue, Form ownerForm = null)
            : base()
        {
            Text = title;
            ApplyPreferredDialogSizing(440, 168, 150, ownerForm);

            var okButton = AntdUiHelper.CreatePrimaryButton("确定");
            var cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            WireDialogButtons(okButton, cancelButton);

            var body = new AntPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = AppTheme.ContentPadding,
            };
            var formLayout = SettingsLayoutHelper.CreateFormLayout(96);
            input = SettingsLayoutHelper.AddRow(formLayout, label, SettingsLayoutHelper.CreateInput(true));
            if (defaultValue == null)
            {
                input.Text = string.Empty;
            }
            else
            {
                input.Text = defaultValue;
            }

            body.Controls.Add(formLayout);

            Controls.Add(CreateButtonBar(okButton, cancelButton));
            Controls.Add(body);
        }

        public string InputText
        {
            get { return input.Text; }
        }
    }
}

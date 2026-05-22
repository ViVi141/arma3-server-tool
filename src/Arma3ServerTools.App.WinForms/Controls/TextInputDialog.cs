using System.Drawing;
using System.Windows.Forms;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class TextInputDialog : Form
    {
        private readonly TextBox inputTextBox;

        public TextInputDialog(string title, string label, string defaultValue)
        {
            Text = title;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            ClientSize = new Size(360, 120);

            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(12), ColumnCount = 2 };
            layout.Controls.Add(new Label { Text = label, AutoSize = true }, 0, 0);
            inputTextBox = new TextBox { Dock = DockStyle.Fill, Text = defaultValue ?? string.Empty };
            layout.Controls.Add(inputTextBox, 1, 0);
            Controls.Add(layout);

            var okButton = new Button { Text = "确定", DialogResult = DialogResult.OK, Width = 80 };
            var cancelButton = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Width = 80 };
            var buttons = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                Height = 40,
                Padding = new Padding(12, 4, 12, 8),
            };
            buttons.Controls.Add(cancelButton);
            buttons.Controls.Add(okButton);
            Controls.Add(buttons);
            AcceptButton = okButton;
            CancelButton = cancelButton;
        }

        public string InputText
        {
            get { return inputTextBox.Text; }
        }
    }
}

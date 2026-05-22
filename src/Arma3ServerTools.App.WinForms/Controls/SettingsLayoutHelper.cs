using System.Drawing;
using System.Windows.Forms;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal static class SettingsLayoutHelper
    {
        public static TableLayoutPanel CreateFormLayout(int labelWidth)
        {
            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                ColumnCount = 2,
                Padding = new Padding(0),
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, labelWidth));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            return layout;
        }

        public static T AddRow<T>(TableLayoutPanel layout, string label, T control) where T : Control
        {
            int row = layout.RowCount;
            layout.RowCount++;
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.Controls.Add(new Label
            {
                Text = label,
                AutoSize = true,
                Anchor = AnchorStyles.Left,
                Padding = new Padding(0, 6, 0, 0),
            }, 0, row);
            layout.Controls.Add(control, 1, row);
            return control;
        }

        public static NumericUpDown CreateNumeric(int min, int max, int value, int width)
        {
            var numeric = new NumericUpDown
            {
                Minimum = min,
                Maximum = max,
                Value = Clamp(min, max, value),
                Width = width,
            };
            return numeric;
        }

        public static decimal Clamp(int min, int max, int value)
        {
            if (value < min)
            {
                return min;
            }

            if (value > max)
            {
                return max;
            }

            return value;
        }

        public static Panel CreateScrollHost(Control content)
        {
            content.Dock = DockStyle.Top;
            content.AutoSize = true;

            var scroll = new Panel
            {
                Dock = DockStyle.Fill,
                AutoScroll = true,
                Padding = new Padding(12),
            };
            scroll.Controls.Add(content);
            return scroll;
        }
    }
}

using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using AntButton = AntdUI.Button;
using AntCheckbox = AntdUI.Checkbox;
using AntInput = AntdUI.Input;
using AntInputNumber = AntdUI.InputNumber;
using AntLabel = AntdUI.Label;
using AntSelect = AntdUI.Select;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal static class SettingsLayoutHelper
    {
        private static readonly Color FormLabelColor = Color.FromArgb(38, 38, 38);

        public static int FieldHeight
        {
            get { return UiScaleHelper.Scale(36); }
        }

        public static TableLayoutPanel CreateFormLayout(int logicalLabelWidth)
        {
            int labelWidth = UiScaleHelper.Scale(logicalLabelWidth);
            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                ColumnCount = 2,
                Padding = new Padding(0),
                BackColor = Color.White,
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, labelWidth));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            return layout;
        }

        public static T AddRow<T>(TableLayoutPanel layout, string label, T control) where T : Control
        {
            return AddRow(layout, label, control, 0);
        }

        public static T AddRow<T>(TableLayoutPanel layout, string label, T control, int logicalRowHeight) where T : Control
        {
            int row = layout.RowCount;
            layout.RowCount++;
            PrepareFieldControl(control, logicalRowHeight);
            int rowHeight = CalculateRowHeight(control, logicalRowHeight);
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, rowHeight));

            if (control.Dock == DockStyle.Fill)
            {
                ApplyFieldWidthStretch(control);
            }

            if (!string.IsNullOrEmpty(label))
            {
                layout.Controls.Add(CreateFormLabel(label), 0, row);
            }

            layout.Controls.Add(control, 1, row);
            return control;
        }

        private static int CalculateRowHeight(Control control, int logicalRowHeight)
        {
            if (logicalRowHeight > 0)
            {
                return UiScaleHelper.Scale(logicalRowHeight) + UiScaleHelper.Scale(4);
            }

            if (control is FlowLayoutPanel flowPanel)
            {
                return MeasureAutoSizeContainerHeight(flowPanel);
            }

            if (control is TableLayoutPanel tablePanel && tablePanel.AutoSize)
            {
                return MeasureAutoSizeContainerHeight(tablePanel);
            }

            if (control is AntInput multilineInput && multilineInput.Multiline)
            {
                return multilineInput.Height + UiScaleHelper.Scale(4);
            }

            if (control is AntLabel label && label.AutoSizeMode == AntdUI.TAutoSize.None)
            {
                return label.Height + UiScaleHelper.Scale(4);
            }

            if (control.Height > FieldHeight)
            {
                return control.Height + UiScaleHelper.Scale(4);
            }

            return FieldHeight + UiScaleHelper.Scale(4);
        }

        private static int MeasureAutoSizeContainerHeight(Control container)
        {
            container.PerformLayout();
            Size preferred = container.GetPreferredSize(new Size(container.Width > 0 ? container.Width : int.MaxValue, 0));
            int height = preferred.Height;
            if (height <= 0)
            {
                height = FieldHeight;
            }

            return height + UiScaleHelper.Scale(4);
        }

        private static void ApplyFieldWidthStretch(Control control)
        {
            control.Dock = DockStyle.None;
            control.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
        }

        public static AntLabel CreateFormLabel(string text)
        {
            return new AntLabel
            {
                Text = text,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                ForeColor = FormLabelColor,
                Font = AppTheme.UiFont,
                Anchor = AnchorStyles.Left | AnchorStyles.Top,
                Padding = new Padding(0, UiScaleHelper.Scale(10), UiScaleHelper.Scale(8), 0),
                Margin = new Padding(0),
            };
        }

        public static void PrepareFieldControl(Control control, int logicalRowHeight)
        {
            if (control is AntInput input)
            {
                if (input.Multiline)
                {
                    if (input.Height <= 0)
                    {
                        input.Height = UiScaleHelper.Scale(logicalRowHeight > 0 ? logicalRowHeight : 70);
                    }
                }
                else
                {
                    input.Height = FieldHeight;
                }

                if (input.Dock == DockStyle.None && input.Width > 0)
                {
                    input.Width = UiScaleHelper.Scale(input.Width);
                }
                return;
            }

            if (control is AntInputNumber numeric)
            {
                numeric.Height = FieldHeight;
                if (numeric.Dock == DockStyle.None && numeric.Width > 0)
                {
                    numeric.Width = UiScaleHelper.Scale(numeric.Width);
                }
                return;
            }

            if (control is AntSelect select)
            {
                select.Height = FieldHeight;
                if (select.Dock == DockStyle.None && select.Width > 0)
                {
                    select.Width = UiScaleHelper.Scale(select.Width);
                }
                return;
            }

            if (control is AntCheckbox checkbox)
            {
                checkbox.MinimumSize = new Size(0, FieldHeight);
                return;
            }

            if (control is AntLabel label && label.AutoSizeMode == AntdUI.TAutoSize.None)
            {
                if (label.Height <= 0)
                {
                    label.Height = UiScaleHelper.Scale(logicalRowHeight > 0 ? logicalRowHeight : 70);
                }

                if (label.Width <= 0)
                {
                    label.Width = UiScaleHelper.Scale(520);
                }
                return;
            }

            if (control.Dock == DockStyle.None && control.Width > 0 && control.Height <= FieldHeight)
            {
                control.Width = UiScaleHelper.Scale(control.Width);
            }
        }

        public static AntInput CreateInput(bool fill)
        {
            var input = new AntInput
            {
                Height = FieldHeight,
            };
            if (fill)
            {
                ApplyFieldWidthStretch(input);
            }

            return input;
        }

        public static AntInput CreateMultilineInput(int logicalHeight)
        {
            var input = new AntInput
            {
                Multiline = true,
                Height = UiScaleHelper.Scale(logicalHeight),
                AutoScroll = true,
            };
            ApplyFieldWidthStretch(input);
            return input;
        }

        public static AntInput CreatePasswordInput()
        {
            var input = new AntInput
            {
                Height = FieldHeight,
                PasswordChar = '*',
            };
            ApplyFieldWidthStretch(input);
            return input;
        }

        public static AntInput CreateReadOnlyInput(int logicalWidth)
        {
            var input = new AntInput
            {
                ReadOnly = true,
                Height = FieldHeight,
            };
            if (logicalWidth > 0)
            {
                input.Width = UiScaleHelper.Scale(logicalWidth);
            }
            else
            {
                ApplyFieldWidthStretch(input);
            }

            return input;
        }

        public static AntCheckbox CreateCheckbox(string text, bool isChecked)
        {
            return new AntCheckbox
            {
                Text = text,
                AutoSize = true,
                Checked = isChecked,
                MinimumSize = new Size(0, FieldHeight),
            };
        }

        public static AntSelect CreateSelect(int logicalWidth, params string[] items)
        {
            var select = new AntSelect
            {
                Width = UiScaleHelper.Scale(logicalWidth),
                Height = FieldHeight,
            };
            AddSelectItems(select, items);
            return select;
        }

        public static void AddSelectItems(AntSelect select, params string[] items)
        {
            select.Items.Clear();
            for (int i = 0; i < items.Length; i++)
            {
                select.Items.Add(new AntdUI.SelectItem(i, items[i]));
            }
        }

        public static AntInputNumber CreateNumeric(int min, int max, int value, int logicalWidth)
        {
            var numeric = new AntInputNumber
            {
                Minimum = min,
                Maximum = max,
                Value = Clamp(min, max, value),
                Width = UiScaleHelper.Scale(logicalWidth),
                Height = FieldHeight,
                DecimalPlaces = 0,
                ShowControl = true,
            };
            return numeric;
        }

        public static AntInputNumber CreateDecimalNumeric(
            decimal min,
            decimal max,
            decimal value,
            int logicalWidth,
            int decimalPlaces)
        {
            var numeric = new AntInputNumber
            {
                Minimum = min,
                Maximum = max,
                Value = ClampDecimal(min, max, value),
                Width = UiScaleHelper.Scale(logicalWidth),
                Height = FieldHeight,
                DecimalPlaces = decimalPlaces,
                ShowControl = true,
            };
            return numeric;
        }

        public static AntButton CreateButton(string text)
        {
            return AntdUiHelper.CreateToolbarButton(text);
        }

        public static Control CreateHorizontalGroup(params Control[] controls)
        {
            var panel = new FlowLayoutPanel
            {
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                Margin = Padding.Empty,
                Padding = Padding.Empty,
            };
            for (int i = 0; i < controls.Length; i++)
            {
                panel.Controls.Add(controls[i]);
            }

            return panel;
        }

        public static Control CreateInlineFieldRow(Control field, Control trailing)
        {
            ApplyFieldWidthStretch(field);
            trailing.Anchor = AnchorStyles.Left | AnchorStyles.Top;
            trailing.Margin = new Padding(UiScaleHelper.Scale(8), 0, 0, 0);

            var row = new TableLayoutPanel
            {
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                ColumnCount = 2,
                Dock = DockStyle.None,
                Margin = Padding.Empty,
                Padding = Padding.Empty,
                Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right,
            };
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            row.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            row.Controls.Add(field, 0, 0);
            row.Controls.Add(trailing, 1, 0);
            return row;
        }

        public static Control CreateGroup(string title, Control content)
        {
            return AntdUiHelper.CreateSection(title, content);
        }

        public static TableLayoutPanel CreateSectionsStack()
        {
            var stack = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                ColumnCount = 1,
                GrowStyle = TableLayoutPanelGrowStyle.AddRows,
                BackColor = Color.White,
            };
            stack.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            return stack;
        }

        public static void AddStackSection(TableLayoutPanel stack, Control section)
        {
            int row = stack.RowCount;
            stack.RowCount = row + 1;
            stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            section.Dock = DockStyle.Top;
            section.AutoSize = true;
            stack.Controls.Add(section, 0, row);
        }

        public static Control CreateScrollHost(Control content)
        {
            var scroll = new SettingsScrollPanel
            {
                Dock = DockStyle.Fill,
                Padding = AppTheme.ContentPadding,
            };
            scroll.AttachContent(content);
            return scroll;
        }

        public static int Clamp(int min, int max, int value)
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

        public static decimal ClampDecimal(decimal min, decimal max, decimal value)
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
    }
}

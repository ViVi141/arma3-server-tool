using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using AntLabel = AntdUI.Label;

namespace Arma3ServerTools.App.WinForms.Controls
{
    /// <summary>
    /// 跟踪设置页内字段的本地编辑，并将对应标签高亮为「未保存」。
    /// </summary>
    internal sealed class SettingsDirtyTracker
    {
        private sealed class TabDirtyState
        {
            public Control Root { get; set; }

            public bool HasLocalEdits { get; set; }

            public HashSet<AntLabel> DirtyLabels { get; } = new HashSet<AntLabel>();

            public Dictionary<Control, object> FieldBaselines { get; } =
                new Dictionary<Control, object>();

            public Dictionary<Control, AntLabel> FieldLabels { get; } =
                new Dictionary<Control, AntLabel>();

            public List<EventHandler> Detachers { get; } = new List<EventHandler>();
        }

        private readonly Dictionary<string, TabDirtyState> tabs =
            new Dictionary<string, TabDirtyState>(StringComparer.Ordinal);

        private readonly Action indicatorsChanged;

        private int suppressDepth;

        public SettingsDirtyTracker(Action indicatorsChanged)
        {
            this.indicatorsChanged = indicatorsChanged;
        }

        public void EnterSuppress()
        {
            suppressDepth++;
        }

        public void ExitSuppress()
        {
            if (suppressDepth > 0)
            {
                suppressDepth--;
            }
        }

        public void RegisterTab(string tabTitle, Control content)
        {
            if (string.IsNullOrEmpty(tabTitle) || content == null)
            {
                return;
            }

            UnregisterTab(tabTitle);

            var state = new TabDirtyState
            {
                Root = content,
            };
            WireControlTree(tabTitle, state, content);
            tabs[tabTitle] = state;
        }

        public void ClearTab(string tabTitle)
        {
            TabDirtyState state;
            if (!tabs.TryGetValue(tabTitle, out state))
            {
                return;
            }

            ResetTabBaselines(state);
        }

        public void ClearAll()
        {
            foreach (KeyValuePair<string, TabDirtyState> pair in tabs)
            {
                ResetTabBaselines(pair.Value);
            }
        }

        public bool IsTabLocallyDirty(string tabTitle)
        {
            TabDirtyState state;
            if (!tabs.TryGetValue(tabTitle, out state))
            {
                return false;
            }

            return state.HasLocalEdits;
        }

        public bool HasAnyLocalEdits()
        {
            foreach (KeyValuePair<string, TabDirtyState> pair in tabs)
            {
                if (pair.Value.HasLocalEdits)
                {
                    return true;
                }
            }

            return false;
        }

        private void UnregisterTab(string tabTitle)
        {
            TabDirtyState state;
            if (!tabs.TryGetValue(tabTitle, out state))
            {
                return;
            }

            foreach (EventHandler detacher in state.Detachers)
            {
                detacher(null, EventArgs.Empty);
            }

            state.Detachers.Clear();
            tabs.Remove(tabTitle);
        }

        private void WireControlTree(string tabTitle, TabDirtyState state, Control root)
        {
            if (root == null)
            {
                return;
            }

            WireTableLayoutRows(tabTitle, state, root);
            foreach (Control child in root.Controls)
            {
                WireSingleControl(tabTitle, state, child, null);
                WireControlTree(tabTitle, state, child);
            }
        }

        private void WireTableLayoutRows(string tabTitle, TabDirtyState state, Control root)
        {
            var layout = root as TableLayoutPanel;
            if (layout == null)
            {
                return;
            }

            // Build row→label and row→field maps in a single pass (O(n) instead of O(n²)).
            var labelByRow = new Dictionary<int, AntLabel>();
            var fieldByRow = new Dictionary<int, Control>();
            foreach (Control child in layout.Controls)
            {
                int childRow = layout.GetRow(child);
                int childCol = layout.GetColumn(child);

                if (childCol == 0 && child is AntLabel label)
                {
                    labelByRow[childRow] = label;
                }
                else if (childCol == 1)
                {
                    fieldByRow[childRow] = child;
                }
            }

            for (int row = 0; row < layout.RowCount; row++)
            {
                AntLabel rowLabel;
                labelByRow.TryGetValue(row, out rowLabel);

                Control fieldControl;
                if (!fieldByRow.TryGetValue(row, out fieldControl))
                {
                    continue;
                }

                if (IsContainerOnly(fieldControl))
                {
                    WireNestedFieldControls(tabTitle, state, fieldControl, rowLabel);
                }
                else
                {
                    WireSingleControl(tabTitle, state, fieldControl, rowLabel);
                }
            }
        }

        private void WireNestedFieldControls(
            string tabTitle,
            TabDirtyState state,
            Control container,
            AntLabel rowLabel)
        {
            foreach (Control child in container.Controls)
            {
                if (IsContainerOnly(child))
                {
                    WireControlTree(tabTitle, state, child);
                    continue;
                }

                WireSingleControl(tabTitle, state, child, rowLabel);
            }
        }

        private void WireSingleControl(
            string tabTitle,
            TabDirtyState state,
            Control control,
            AntLabel rowLabel)
        {
            if (control == null || IsContainerOnly(control))
            {
                return;
            }

            AntLabel label = rowLabel;
            if (label == null)
            {
                label = control.Tag as AntLabel;
            }

            WireAntInput(tabTitle, state, control, label);
            WireAntCheckbox(tabTitle, state, control, label);
            WireAntInputNumber(tabTitle, state, control, label);
            WireAntSelect(tabTitle, state, control, label);
            WireWinFormsTextBox(tabTitle, state, control, label);
            WireWinFormsNumeric(tabTitle, state, control, label);
            WireWinFormsCheckBox(tabTitle, state, control, label);
        }

        private static bool IsContainerOnly(Control control)
        {
            if (control is Panel || control is TableLayoutPanel || control is FlowLayoutPanel)
            {
                return true;
            }

            if (control is SplitContainer)
            {
                return true;
            }

            return false;
        }

        private void WireAntInput(string tabTitle, TabDirtyState state, Control control, AntLabel label)
        {
            var input = control as AntdUI.Input;
            if (input == null)
            {
                return;
            }

            RegisterTrackedField(state, input, label);
            EventHandler handler = delegate
            {
                EvaluateFieldDirty(tabTitle, state, input);
            };
            input.TextChanged += handler;
            state.Detachers.Add(
                delegate
                {
                    input.TextChanged -= handler;
                });
        }

        private void WireAntCheckbox(string tabTitle, TabDirtyState state, Control control, AntLabel label)
        {
            var checkbox = control as AntdUI.Checkbox;
            if (checkbox == null)
            {
                return;
            }

            RegisterTrackedField(state, checkbox, label);
            AntdUI.BoolEventHandler handler = delegate
            {
                EvaluateFieldDirty(tabTitle, state, checkbox);
            };
            checkbox.CheckedChanged += handler;
            state.Detachers.Add(
                delegate
                {
                    checkbox.CheckedChanged -= handler;
                });
        }

        private void WireAntInputNumber(string tabTitle, TabDirtyState state, Control control, AntLabel label)
        {
            var inputNumber = control as AntdUI.InputNumber;
            if (inputNumber == null)
            {
                return;
            }

            RegisterTrackedField(state, inputNumber, label);
            AntdUI.DecimalEventHandler handler = delegate
            {
                EvaluateFieldDirty(tabTitle, state, inputNumber);
            };
            inputNumber.ValueChanged += handler;
            state.Detachers.Add(
                delegate
                {
                    inputNumber.ValueChanged -= handler;
                });
        }

        private void WireAntSelect(string tabTitle, TabDirtyState state, Control control, AntLabel label)
        {
            var select = control as AntdUI.Select;
            if (select == null)
            {
                return;
            }

            RegisterTrackedField(state, select, label);
            AntdUI.IntEventHandler handler = delegate
            {
                EvaluateFieldDirty(tabTitle, state, select);
            };
            select.SelectedIndexChanged += handler;
            state.Detachers.Add(
                delegate
                {
                    select.SelectedIndexChanged -= handler;
                });
        }

        private void WireWinFormsTextBox(string tabTitle, TabDirtyState state, Control control, AntLabel label)
        {
            var textBox = control as TextBox;
            if (textBox == null)
            {
                return;
            }

            RegisterTrackedField(state, textBox, label);
            EventHandler handler = delegate
            {
                EvaluateFieldDirty(tabTitle, state, textBox);
            };
            textBox.TextChanged += handler;
            state.Detachers.Add(
                delegate
                {
                    textBox.TextChanged -= handler;
                });
        }

        private void WireWinFormsNumeric(string tabTitle, TabDirtyState state, Control control, AntLabel label)
        {
            var numeric = control as NumericUpDown;
            if (numeric == null)
            {
                return;
            }

            RegisterTrackedField(state, numeric, label);
            EventHandler handler = delegate
            {
                EvaluateFieldDirty(tabTitle, state, numeric);
            };
            numeric.ValueChanged += handler;
            state.Detachers.Add(
                delegate
                {
                    numeric.ValueChanged -= handler;
                });
        }

        private void WireWinFormsCheckBox(string tabTitle, TabDirtyState state, Control control, AntLabel label)
        {
            var checkbox = control as CheckBox;
            if (checkbox == null)
            {
                return;
            }

            RegisterTrackedField(state, checkbox, label);
            EventHandler handler = delegate
            {
                EvaluateFieldDirty(tabTitle, state, checkbox);
            };
            checkbox.CheckedChanged += handler;
            state.Detachers.Add(
                delegate
                {
                    checkbox.CheckedChanged -= handler;
                });
        }

        private static void RegisterTrackedField(TabDirtyState state, Control control, AntLabel label)
        {
            if (state.FieldBaselines.ContainsKey(control))
            {
                return;
            }

            state.FieldBaselines[control] = GetControlValue(control);
            if (label != null)
            {
                state.FieldLabels[control] = label;
            }
        }

        private void EvaluateFieldDirty(string tabTitle, TabDirtyState state, Control control)
        {
            if (suppressDepth > 0)
            {
                return;
            }

            object baseline;
            if (!state.FieldBaselines.TryGetValue(control, out baseline))
            {
                return;
            }

            bool isDirty = !ValuesEqual(baseline, GetControlValue(control));
            AntLabel label;
            state.FieldLabels.TryGetValue(control, out label);
            UpdateLabelDirtyState(state, label, isDirty, control);
            RecomputeTabDirtyState(state);
            RaiseIndicatorsChanged();
        }

        private static void UpdateLabelDirtyState(
            TabDirtyState state,
            AntLabel label,
            bool isDirty,
            Control changedControl)
        {
            if (label == null || label.IsDisposed)
            {
                return;
            }

            if (isDirty)
            {
                if (state.DirtyLabels.Add(label))
                {
                    label.ForeColor = SettingsLayoutHelper.DirtyFieldLabelColor;
                }

                return;
            }

            if (IsLabelStillDirtyFromOtherFields(state, label, changedControl))
            {
                return;
            }

            if (state.DirtyLabels.Remove(label))
            {
                label.ForeColor = SettingsLayoutHelper.FormLabelColor;
            }
        }

        private static bool IsLabelStillDirtyFromOtherFields(
            TabDirtyState state,
            AntLabel label,
            Control excludeControl)
        {
            foreach (KeyValuePair<Control, AntLabel> pair in state.FieldLabels)
            {
                if (pair.Value != label)
                {
                    continue;
                }

                if (ReferenceEquals(pair.Key, excludeControl))
                {
                    continue;
                }

                if (pair.Key.IsDisposed)
                {
                    continue;
                }

                object baseline;
                if (!state.FieldBaselines.TryGetValue(pair.Key, out baseline))
                {
                    continue;
                }

                if (!ValuesEqual(baseline, GetControlValue(pair.Key)))
                {
                    return true;
                }
            }

            return false;
        }

        private static void RecomputeTabDirtyState(TabDirtyState state)
        {
            bool anyDirty = false;
            foreach (KeyValuePair<Control, object> pair in state.FieldBaselines)
            {
                if (pair.Key.IsDisposed)
                {
                    continue;
                }

                if (!ValuesEqual(pair.Value, GetControlValue(pair.Key)))
                {
                    anyDirty = true;
                    break;
                }
            }

            state.HasLocalEdits = anyDirty;
        }

        private void ResetTabBaselines(TabDirtyState state)
        {
            foreach (Control control in new List<Control>(state.FieldBaselines.Keys))
            {
                if (control.IsDisposed)
                {
                    state.FieldBaselines.Remove(control);
                    state.FieldLabels.Remove(control);
                    continue;
                }

                state.FieldBaselines[control] = GetControlValue(control);
            }

            foreach (AntLabel label in state.DirtyLabels)
            {
                if (label != null && !label.IsDisposed)
                {
                    label.ForeColor = SettingsLayoutHelper.FormLabelColor;
                }
            }

            state.DirtyLabels.Clear();
            state.HasLocalEdits = false;
        }

        private void RaiseIndicatorsChanged()
        {
            if (indicatorsChanged != null)
            {
                indicatorsChanged();
            }
        }

        private static object GetControlValue(Control control)
        {
            var antInput = control as AntdUI.Input;
            if (antInput != null)
            {
                return antInput.Text ?? string.Empty;
            }

            var antCheckbox = control as AntdUI.Checkbox;
            if (antCheckbox != null)
            {
                return antCheckbox.Checked;
            }

            var antInputNumber = control as AntdUI.InputNumber;
            if (antInputNumber != null)
            {
                return antInputNumber.Value;
            }

            var antSelect = control as AntdUI.Select;
            if (antSelect != null)
            {
                return antSelect.SelectedIndex;
            }

            var textBox = control as TextBox;
            if (textBox != null)
            {
                return textBox.Text ?? string.Empty;
            }

            var numeric = control as NumericUpDown;
            if (numeric != null)
            {
                return numeric.Value;
            }

            var checkbox = control as CheckBox;
            if (checkbox != null)
            {
                return checkbox.Checked;
            }

            return null;
        }

        private static bool ValuesEqual(object baseline, object current)
        {
            if (baseline == null && current == null)
            {
                return true;
            }

            if (baseline == null || current == null)
            {
                return false;
            }

            string baselineText = baseline as string;
            if (baselineText != null)
            {
                string currentText = current as string;
                if (currentText == null)
                {
                    return false;
                }

                return string.Equals(baselineText, currentText, StringComparison.Ordinal);
            }

            if (baseline is decimal)
            {
                decimal baselineDecimal = (decimal)baseline;
                if (!(current is decimal))
                {
                    return false;
                }

                decimal currentDecimal = (decimal)current;
                return baselineDecimal == currentDecimal;
            }

            return baseline.Equals(current);
        }
    }
}

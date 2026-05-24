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

      state.HasLocalEdits = false;
      foreach (AntLabel label in state.DirtyLabels)
      {
        if (label != null && !label.IsDisposed)
        {
          label.ForeColor = SettingsLayoutHelper.FormLabelColor;
        }
      }

      state.DirtyLabels.Clear();
    }

    public void ClearAll()
    {
      foreach (string tabTitle in new List<string>(tabs.Keys))
      {
        ClearTab(tabTitle);
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

      for (int row = 0; row < layout.RowCount; row++)
      {
        AntLabel rowLabel = null;
        Control fieldControl = null;
        foreach (Control child in layout.Controls)
        {
          int childRow = layout.GetRow(child);
          if (childRow != row)
          {
            continue;
          }

          if (layout.GetColumn(child) == 0 && child is AntLabel)
          {
            rowLabel = (AntLabel)child;
          }
          else if (layout.GetColumn(child) == 1)
          {
            fieldControl = child;
          }
        }

        if (fieldControl != null)
        {
          WireSingleControl(tabTitle, state, fieldControl, rowLabel);
        }
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

      EventHandler handler = delegate
      {
        MarkDirty(tabTitle, state, label);
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

      AntdUI.BoolEventHandler handler = delegate
      {
        MarkDirty(tabTitle, state, label);
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

      AntdUI.DecimalEventHandler handler = delegate
      {
        MarkDirty(tabTitle, state, label);
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

      AntdUI.IntEventHandler handler = delegate
      {
        MarkDirty(tabTitle, state, label);
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

      EventHandler handler = delegate
      {
        MarkDirty(tabTitle, state, label);
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

      EventHandler handler = delegate
      {
        MarkDirty(tabTitle, state, label);
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

      EventHandler handler = delegate
      {
        MarkDirty(tabTitle, state, label);
      };
      checkbox.CheckedChanged += handler;
      state.Detachers.Add(
          delegate
          {
            checkbox.CheckedChanged -= handler;
          });
    }

    private void MarkDirty(string tabTitle, TabDirtyState state, AntLabel label)
    {
      if (suppressDepth > 0)
      {
        return;
      }

      state.HasLocalEdits = true;
      if (label != null && !label.IsDisposed)
      {
        if (state.DirtyLabels.Add(label))
        {
          label.ForeColor = SettingsLayoutHelper.DirtyFieldLabelColor;
        }
      }

      if (indicatorsChanged != null)
      {
        indicatorsChanged();
      }
    }
  }
}

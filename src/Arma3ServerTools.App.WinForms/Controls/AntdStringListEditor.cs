using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using AntButton = AntdUI.Button;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class AntdStringListEditor : UserControl
    {
        private readonly ListBox listBox;
        private readonly List<string> items = new List<string>();
        private readonly Func<string, string> validateTrimmedOptional;
        private readonly string resolvedAddTitle;
        private readonly string resolvedAddLabel;
        private readonly string resolvedAddDefault;
        private readonly string resolvedValidationTitle;

        public AntdStringListEditor(int logicalHeight)
            : this(logicalHeight, null, null, null, null, null)
        {
        }

        public AntdStringListEditor(
            int logicalHeight,
            Func<string, string> validateTrimmedOptional,
            string addDialogTitle,
            string addDialogLabel,
            string addDialogDefault,
            string validationWarningTitle)
        {
            this.validateTrimmedOptional = validateTrimmedOptional;
            if (string.IsNullOrEmpty(addDialogTitle))
            {
                resolvedAddTitle = "添加项";
            }
            else
            {
                resolvedAddTitle = addDialogTitle;
            }

            if (string.IsNullOrEmpty(addDialogLabel))
            {
                resolvedAddLabel = "输入值";
            }
            else
            {
                resolvedAddLabel = addDialogLabel;
            }

            resolvedAddDefault = addDialogDefault ?? string.Empty;
            if (string.IsNullOrEmpty(validationWarningTitle))
            {
                resolvedValidationTitle = "提示";
            }
            else
            {
                resolvedValidationTitle = validationWarningTitle;
            }

            Dock = DockStyle.None;
            Height = UiScaleHelper.Scale(logicalHeight);
            Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;

            var addButton = SettingsLayoutHelper.CreateButton("添加");
            var removeButton = SettingsLayoutHelper.CreateButton("删除");
            addButton.Click += OnAdd;
            removeButton.Click += OnRemove;

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Right,
                FlowDirection = FlowDirection.TopDown,
                AutoSize = true,
                Padding = new Padding(UiScaleHelper.Scale(8), 0, 0, 0),
            };
            toolbar.Controls.Add(addButton);
            toolbar.Controls.Add(removeButton);

            listBox = new ListBox
            {
                Dock = DockStyle.Fill,
                IntegralHeight = false,
                SelectionMode = SelectionMode.One,
                BorderStyle = BorderStyle.FixedSingle,
                Font = AppTheme.UiFont,
            };

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            layout.Controls.Add(listBox, 0, 0);
            layout.Controls.Add(toolbar, 1, 0);
            Controls.Add(layout);
        }

        public IList<string> Items
        {
            get { return items; }
        }

        public void SetItems(IEnumerable<string> values)
        {
            items.Clear();
            if (values != null)
            {
                items.AddRange(values);
            }

            ReloadList();
        }

        public List<string> GetItemsCopy()
        {
            return items.ToList();
        }

        private void ReloadList()
        {
            listBox.BeginUpdate();
            listBox.Items.Clear();
            foreach (string item in items)
            {
                listBox.Items.Add(item);
            }

            listBox.EndUpdate();
        }

        private void OnAdd(object sender, EventArgs e)
        {
            Form ownerForm = FindForm();
            using (var prompt = new TextInputDialog(resolvedAddTitle, resolvedAddLabel, resolvedAddDefault, ownerForm))
            {
                if (prompt.ShowDialog(ownerForm) != DialogResult.OK)
                {
                    return;
                }

                string value = prompt.InputText;
                if (string.IsNullOrWhiteSpace(value))
                {
                    return;
                }

                string trimmed = value.Trim();
                if (validateTrimmedOptional != null)
                {
                    string validationError = validateTrimmedOptional(trimmed);
                    if (!string.IsNullOrEmpty(validationError))
                    {
                        AntdUiHelper.ShowWarning(FindForm(), validationError, resolvedValidationTitle);
                        return;
                    }
                }

                items.Add(trimmed);
                ReloadList();
            }
        }

        private void OnRemove(object sender, EventArgs e)
        {
            if (listBox.SelectedIndex < 0 || listBox.SelectedIndex >= items.Count)
            {
                return;
            }

            items.RemoveAt(listBox.SelectedIndex);
            ReloadList();
        }
    }
}

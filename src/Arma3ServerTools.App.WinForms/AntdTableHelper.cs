using System;
using System.Collections.Generic;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms
{
    internal static class AntdTableHelper
    {
        public sealed class ColumnSpec
        {
            public ColumnSpec(string key, string title, string width, AntdUI.ColumnAlign align)
            {
                Key = key;
                Title = title;
                Width = width;
                Align = align;
            }

            public string Key { get; }

            public string Title { get; }

            public string Width { get; }

            public AntdUI.ColumnAlign Align { get; }
        }

        public static AntTable CreateStandardTable()
        {
            return new AntTable
            {
                Dock = System.Windows.Forms.DockStyle.Fill,
                Bordered = true,
                Radius = UiScaleHelper.Scale(6),
                FixedHeader = true,
                VisibleHeader = true,
                AutoSizeColumnsMode = AntdUI.ColumnsMode.Fill,
                RowHeight = UiScaleHelper.Scale(32),
                RowHeightHeader = UiScaleHelper.Scale(34),
                Gap = UiScaleHelper.Scale(6),
            };
        }

        public static AntTable CreateTextTable(params ColumnSpec[] specs)
        {
            AntTable table = CreateStandardTable();
            var columns = new AntdUI.ColumnCollection();
            foreach (ColumnSpec spec in specs)
            {
                columns.Add(new AntdUI.Column(spec.Key, spec.Title)
                {
                    Width = spec.Width,
                    Align = spec.Align,
                });
            }

            table.Columns = columns;
            return table;
        }

        public static void BindData(AntTable table, object dataSource)
        {
            table.DataSource = dataSource;
        }

        public static void BindList<T>(AntTable table, IList<T> rows)
        {
            table.DataSource = rows;
        }

        public static int GetSelectedRowIndex(AntTable table)
        {
            if (table.SelectedIndex <= 0)
            {
                return -1;
            }

            return table.SelectedIndex - 1;
        }

        public static void SelectRowIndex(AntTable table, int rowIndex)
        {
            if (rowIndex < 0)
            {
                table.SelectedIndex = 0;
                return;
            }

            table.SelectedIndex = rowIndex + 1;
        }
    }
}

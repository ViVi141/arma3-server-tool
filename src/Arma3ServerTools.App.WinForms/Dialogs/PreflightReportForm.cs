using System.Collections.Generic;
using System.Drawing;
using System.Text;
using System.Windows.Forms;
using AntButton = AntdUI.Button;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;
using Arma3ServerTools.Application.Services;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class PreflightReportForm : AntdDialogForm
    {
        public PreflightReportForm(IReadOnlyList<PreflightCheckItem> items, bool allowProceedDespiteWarnings)
            : base()
        {
            Text = "启动前检查";
            ApplyPreferredDialogSizing(640, 480, null);

            bool hasError = false;
            var builder = new StringBuilder();
            foreach (PreflightCheckItem item in items)
            {
                if (item.IsError)
                {
                    hasError = true;
                    builder.AppendLine("[错误] " + item.Title);
                }
                else
                {
                    builder.AppendLine("[通过] " + item.Title);
                }

                builder.AppendLine("  " + item.Detail);
                builder.AppendLine();
            }

            AntLabel body = AntdUiHelper.CreateHintLabel(builder.ToString(), 580);
            body.Dock = DockStyle.Fill;
            body.Padding = AppTheme.ContentPadding;

            AntButton closeButton = AntdUiHelper.CreatePrimaryButton("关闭");
            closeButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            AntButton proceedButton = AntdUiHelper.CreateToolbarButton("仍要启动");
            proceedButton.Visible = allowProceedDespiteWarnings && !hasError;
            proceedButton.Click += delegate
            {
                DialogResult = DialogResult.OK;
                Close();
            };

            if (hasError)
            {
                proceedButton.Visible = false;
                AntLabel warn = new AntLabel
                {
                    Dock = DockStyle.Top,
                    AutoSizeMode = AntdUI.TAutoSize.Auto,
                    ForeColor = Color.Firebrick,
                    Padding = UiScaleHelper.ScalePadding(12, 8),
                    Text = "存在错误项，请修复后再启动。",
                };
                Controls.Add(warn);
            }

            var buttonBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                AutoSize = true,
                Padding = UiScaleHelper.ScalePadding(12, 4, 12, 8),
            };
            buttonBar.Controls.Add(closeButton);
            if (proceedButton.Visible)
            {
                buttonBar.Controls.Add(proceedButton);
            }

            var filler = new AntPanel { Dock = DockStyle.Fill };
            filler.Controls.Add(body);

            Controls.Add(buttonBar);
            Controls.Add(filler);
        }
    }
}

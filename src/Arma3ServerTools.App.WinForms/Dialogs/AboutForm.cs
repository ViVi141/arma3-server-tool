using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Controls;
using AntButton = AntdUI.Button;
using AntLabel = AntdUI.Label;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class AboutForm : AntdDialogForm
    {
        private const string RepoUrl = "https://github.com/ViVi141/arma3-server-tool";
        private const string MaintainerUrl = "https://github.com/ViVi141";
        private const string OriginalProjectUrl = "https://destiny.cool/s/arma3-tool";
        private const string OriginalBlogUrl = "https://destiny.cool/archives/1709790542346";
        private const string LicenseUrl = "https://www.apache.org/licenses/LICENSE-2.0";

        public AboutForm()
            : base()
        {
            ApplyPreferredDialogSizing(720, 900, 680, null);

            AntdUI.PageHeader header = CreateDialogHeader("关于");
            Control body = BuildScrollBody();
            Control buttonBar = BuildButtonBar();
            MountDialogLayout(body, buttonBar, header);
        }

        private Control BuildScrollBody()
        {
            int contentWidth = UiScaleHelper.Scale(620);
            Control content = BuildContentStack(contentWidth);
            return SettingsLayoutHelper.CreateScrollHost(content);
        }

        private Control BuildContentStack(int contentWidth)
        {
            var stack = new TableLayoutPanel
            {
                AutoSize = true,
                ColumnCount = 1,
                Dock = DockStyle.Top,
                Width = contentWidth,
            };
            stack.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, contentWidth));

            AddStackRow(stack, CreateTitleBlock(contentWidth));
            AddStackRow(stack, CreateSectionHeader("项目链接"));
            AddStackRow(stack, CreateLinksPanel());
            AddStackRow(stack, CreateSectionHeader("许可与声明"));
            AddStackRow(stack, CreateBodyLabel(
                "本软件采用 Apache License 2.0 开源发布。"
                + Environment.NewLine
                + "随程序附带 LICENSE、NOTICE 与 THIRD-PARTY-NOTICES.txt。"
                + Environment.NewLine
                + "Arma 3 与 BattlEye 分别为 Bohemia Interactive 与 BattlEye Innovations 的商标；"
                + "本项目与上述公司无隶属关系。",
                contentWidth));
            AddStackRow(stack, CreateSectionHeader("项目来源"));
            AddStackRow(stack, CreateBodyLabel(
                "当前维护：ViVi141（GitHub 仓库见上）"
                + Environment.NewLine
                + "原作者：Blue、七龙（destiny studio / SkyCityStudio）"
                + Environment.NewLine
                + "本仓库为去 DevExpress、.NET 10 分层重构的独立演进分支。",
                contentWidth));
            AddStackRow(stack, CreateSectionHeader("赞赏支持"));
            AddStackRow(stack, CreateRewardPanel(contentWidth));
            AddStackRow(stack, CreateBottomSpacer());

            return stack;
        }

        private static Control CreateBottomSpacer()
        {
            return new Panel
            {
                Height = UiScaleHelper.Scale(12),
                Width = 1,
                Margin = new Padding(0),
            };
        }

        private static void AddStackRow(TableLayoutPanel stack, Control control)
        {
            int rowIndex = stack.RowCount;
            stack.RowCount++;
            stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            control.Margin = new Padding(0, 0, 0, UiScaleHelper.Scale(4));
            control.Dock = DockStyle.Top;
            stack.Controls.Add(control, 0, rowIndex);
        }

        private static AntLabel CreateSectionHeader(string text)
        {
            return AntdUiHelper.CreateSectionHeader(text);
        }

        private Control CreateTitleBlock(int contentWidth)
        {
            string versionText = AppVersion.GetDisplayVersion();
            Label label = CreateBodyLabel(
                UiLabels.AppTitle + Environment.NewLine
                + "版本 " + versionText + Environment.NewLine
                + "面向 Windows 的 Arma 3 专用服务器配置与管理工具。",
                contentWidth);
            label.ForeColor = Color.FromArgb(38, 38, 38);
            label.Margin = new Padding(0, 0, 0, UiScaleHelper.Scale(8));
            return label;
        }

        private Control CreateLinksPanel()
        {
            var panel = new FlowLayoutPanel
            {
                AutoSize = true,
                WrapContents = true,
                FlowDirection = FlowDirection.LeftToRight,
                Margin = new Padding(0, 0, 0, UiScaleHelper.Scale(8)),
            };

            panel.Controls.Add(CreateLinkButton("GitHub 仓库", RepoUrl));
            panel.Controls.Add(CreateLinkButton("维护者 ViVi141", MaintainerUrl));
            panel.Controls.Add(CreateLinkButton("原项目主页", OriginalProjectUrl));
            panel.Controls.Add(CreateLinkButton("原作者博文", OriginalBlogUrl));
            panel.Controls.Add(CreateLinkButton("Apache 2.0 许可", LicenseUrl));
            return panel;
        }

        private Control CreateRewardPanel(int contentWidth)
        {
            int qrSize = UiScaleHelper.Scale(228);
            int qrGap = UiScaleHelper.Scale(36);
            var qrRow = new FlowLayoutPanel
            {
                AutoSize = true,
                WrapContents = false,
                FlowDirection = FlowDirection.LeftToRight,
                Margin = new Padding(0, 0, 0, UiScaleHelper.Scale(8)),
            };

            Control wechatCard = CreateQrCard("微信赞赏", "Assets\\reward-wechat.png", qrSize);
            Control alipayCard = CreateQrCard("支付宝", "Assets\\reward-alipay.jpg", qrSize);
            wechatCard.Margin = new Padding(0, 0, qrGap, 0);
            qrRow.Controls.Add(wechatCard);
            qrRow.Controls.Add(alipayCard);

            Label hint = CreateBodyLabel(
                "若本工具对你有帮助，欢迎扫码支持开发与维护。双击二维码可放大查看。",
                contentWidth);
            hint.Margin = new Padding(0, 0, 0, UiScaleHelper.Scale(8));

            var section = new FlowLayoutPanel
            {
                AutoSize = true,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                Width = contentWidth,
            };
            section.Controls.Add(qrRow);
            section.Controls.Add(hint);
            return section;
        }

        private static Label CreateBodyLabel(string text, int maxWidth)
        {
            return new Label
            {
                Text = text,
                AutoSize = true,
                MaximumSize = new Size(maxWidth, 0),
                Font = AppTheme.UiFont,
                ForeColor = Color.Gray,
                UseMnemonic = false,
            };
        }

        private Control CreateQrCard(string caption, string relativeAssetPath, int qrSize)
        {
            var card = new FlowLayoutPanel
            {
                AutoSize = true,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
            };

            Image image = TryLoadAssetImage(relativeAssetPath);
            var picture = new PictureBox
            {
                Size = new Size(qrSize, qrSize),
                SizeMode = PictureBoxSizeMode.Zoom,
                BorderStyle = BorderStyle.FixedSingle,
                BackColor = Color.White,
                Margin = new Padding(0),
                Cursor = Cursors.Hand,
            };
            if (image != null)
            {
                picture.Image = image;
            }

            picture.DoubleClick += delegate
            {
                OnQrPictureDoubleClick(caption, picture.Image);
            };

            var captionLabel = new Label
            {
                Text = caption,
                AutoSize = true,
                Width = qrSize,
                TextAlign = ContentAlignment.MiddleCenter,
                Font = AppTheme.UiFont,
                Margin = new Padding(0, UiScaleHelper.Scale(8), 0, 0),
                Cursor = Cursors.Hand,
            };
            captionLabel.DoubleClick += delegate
            {
                OnQrPictureDoubleClick(caption, picture.Image);
            };

            var tooltip = new ToolTip();
            tooltip.SetToolTip(picture, "双击放大查看");
            tooltip.SetToolTip(captionLabel, "双击放大查看");

            card.Controls.Add(picture);
            card.Controls.Add(captionLabel);
            return card;
        }

        private void OnQrPictureDoubleClick(string caption, Image image)
        {
            if (image == null)
            {
                AntdUiHelper.ShowInfo(this, "未找到二维码图片。", "提示");
                return;
            }

            using (var preview = new RewardQrPreviewForm(this, caption, image))
            {
                preview.ShowDialog(this);
            }
        }

        private Control BuildButtonBar()
        {
            AntButton licenseButton = AntdUiHelper.CreateToolbarButton("打开 LICENSE");
            licenseButton.Click += delegate
            {
                TryOpenBundledFile("LICENSE");
            };

            AntButton noticeButton = AntdUiHelper.CreateToolbarButton("打开 NOTICE");
            noticeButton.Click += delegate
            {
                TryOpenBundledFile("NOTICE");
            };

            AntButton thirdPartyButton = AntdUiHelper.CreateToolbarButton("第三方许可");
            thirdPartyButton.Click += delegate
            {
                TryOpenBundledFile("THIRD-PARTY-NOTICES.txt");
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
                Padding = UiScaleHelper.ScalePadding(12, 8, 12, 12),
            };
            buttonBar.Controls.Add(closeButton);
            buttonBar.Controls.Add(thirdPartyButton);
            buttonBar.Controls.Add(noticeButton);
            buttonBar.Controls.Add(licenseButton);
            return buttonBar;
        }

        private static AntButton CreateLinkButton(string text, string url)
        {
            AntButton button = AntdUiHelper.CreateToolbarButton(text);
            button.Margin = new Padding(0, 0, UiScaleHelper.Scale(8), UiScaleHelper.Scale(8));
            button.Click += delegate
            {
                TryOpenUrl(url);
            };
            return button;
        }

        private static Image TryLoadAssetImage(string relativePath)
        {
            string path = Path.Combine(AppContext.BaseDirectory, relativePath);
            if (!File.Exists(path))
            {
                return null;
            }

            try
            {
                using (FileStream stream = File.OpenRead(path))
                {
                    return Image.FromStream(stream);
                }
            }
            catch
            {
                return null;
            }
        }

        private static void TryOpenUrl(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true,
                });
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(null, "无法打开链接: " + ex.Message, "错误");
            }
        }

        private static void TryOpenBundledFile(string fileName)
        {
            string baseDir = AppContext.BaseDirectory;
            string path = Path.Combine(baseDir, fileName);
            if (!File.Exists(path))
            {
                path = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", fileName));
            }

            if (!File.Exists(path))
            {
                AntdUiHelper.ShowInfo(null, "未找到文件: " + fileName, "提示");
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = path,
                UseShellExecute = true,
            });
        }
    }
}

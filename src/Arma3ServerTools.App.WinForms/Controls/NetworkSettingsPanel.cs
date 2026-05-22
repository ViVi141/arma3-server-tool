using System;
using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class NetworkSettingsPanel : UserControl, IServerSettingsPanel
    {
        private readonly RadioButton simpleModeRadio;
        private readonly RadioButton professionalModeRadio;
        private readonly Panel simpleModePanel;
        private readonly Panel professionalModePanel;
        private NumericUpDown uploadMbpsNumeric;
        private Label limitFpsHintLabel;
        private Label simplePreviewLabel;
        private NumericUpDown maxMsgSendNumeric;
        private NumericUpDown maxSizeGuaranteedNumeric;
        private NumericUpDown maxSizeNonguaranteedNumeric;
        private NumericUpDown minBandwidthNumeric;
        private NumericUpDown maxBandwidthNumeric;
        private NumericUpDown minErrorNumeric;
        private NumericUpDown minErrorNearNumeric;
        private NumericUpDown maxPacketSizeNumeric;
        private NumericUpDown maxCustomFileSizeNumeric;
        private NumericUpDown steamProtocolNumeric;
        private NumericUpDown disconnectTimeoutNumeric;
        private NumericUpDown maxDesyncNumeric;
        private NumericUpDown maxPingNumeric;
        private NumericUpDown maxPacketLossNumeric;
        private CheckBox upnpCheckBox;
        private CheckBox loopBackCheckBox;
        private CheckBox bandwidthAlgCheckBox;

        private ArmaServerConfig boundConfig;
        private bool suppressSimpleRecalculate;

        public NetworkSettingsPanel()
        {
            Dock = DockStyle.Fill;

            var rootLayout = SettingsLayoutHelper.CreateFormLayout(160);
            simpleModeRadio = CreateModeRadio("简易（按上行带宽自动计算）", false);
            professionalModeRadio = CreateModeRadio("专业（手动调整全部参数）", true);
            var modePanel = new FlowLayoutPanel
            {
                AutoSize = true,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                Margin = new Padding(0, 0, 0, 8),
            };
            modePanel.Controls.Add(simpleModeRadio);
            modePanel.Controls.Add(professionalModeRadio);
            SettingsLayoutHelper.AddRow(rootLayout, "配置模式", modePanel);

            simpleModePanel = BuildSimpleModePanel();
            professionalModePanel = BuildProfessionalModePanel();
            Panel commonPanel = BuildCommonPanel();

            var stack = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                ColumnCount = 1,
            };
            stack.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            AddStackRow(stack, simpleModePanel);
            AddStackRow(stack, professionalModePanel);
            AddStackRow(stack, commonPanel);

            int stackRow = rootLayout.RowCount;
            rootLayout.RowCount++;
            rootLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            rootLayout.Controls.Add(stack, 0, stackRow);
            rootLayout.SetColumnSpan(stack, 2);

            simpleModeRadio.CheckedChanged += ModeRadio_CheckedChanged;
            professionalModeRadio.CheckedChanged += ModeRadio_CheckedChanged;
            uploadMbpsNumeric.ValueChanged += SimpleInput_ValueChanged;

            Controls.Add(SettingsLayoutHelper.CreateScrollHost(rootLayout));
            UpdateModeVisibility();
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            if (config == null)
            {
                Enabled = false;
                return;
            }

            Enabled = true;
            suppressSimpleRecalculate = true;
            try
            {
                if (config.BasicConfig.NetworkSimpleMode)
                {
                    simpleModeRadio.Checked = true;
                }
                else
                {
                    professionalModeRadio.Checked = true;
                }

                decimal uploadMbps = config.BasicConfig.UploadBandwidthMbps;
                if (uploadMbps <= 0)
                {
                    uploadMbps = NetworkBandwidthCalculator.ReverseUploadMbps(
                        config.BasicConfig.MaxMsgSend,
                        config.StartupParameters.LimitFPS,
                        config.BasicConfig.MaxPacketSize);
                }

                uploadMbpsNumeric.Value = ClampDecimal(uploadMbpsNumeric, uploadMbps);
                UpdateLimitFpsHint();

                maxMsgSendNumeric.Value = SettingsLayoutHelper.Clamp(
                    NetworkBandwidthCalculator.MaxMsgSendMinimum,
                    NetworkBandwidthCalculator.MaxMsgSendMaximum,
                    config.BasicConfig.MaxMsgSend);
                maxSizeGuaranteedNumeric.Value = SettingsLayoutHelper.Clamp(1, 4096, config.BasicConfig.MaxSizeGuaranteed);
                maxSizeNonguaranteedNumeric.Value = SettingsLayoutHelper.Clamp(1, 4096, config.BasicConfig.MaxSizeNonguaranteed);
                minBandwidthNumeric.Value = config.BasicConfig.MinBandwidth;
                maxBandwidthNumeric.Value = config.BasicConfig.MaxBandwidth;
                minErrorNumeric.Value = (decimal)config.BasicConfig.MinErrorToSend;
                minErrorNearNumeric.Value = (decimal)config.BasicConfig.MinErrorToSendNear;
                maxPacketSizeNumeric.Value = SettingsLayoutHelper.Clamp(256, 4096, config.BasicConfig.MaxPacketSize);
                maxCustomFileSizeNumeric.Value = SettingsLayoutHelper.Clamp(1, 65536, config.BasicConfig.MaxCustomFileSize);
                steamProtocolNumeric.Value = SettingsLayoutHelper.Clamp(256, 4096, config.ServerConfig.SteamProtocolMaxDataSize);
                disconnectTimeoutNumeric.Value = SettingsLayoutHelper.Clamp(1, 300, config.ServerConfig.DisconnectTimeout);
                maxDesyncNumeric.Value = SettingsLayoutHelper.Clamp(1, 1000, config.ServerConfig.Maxdesync);
                maxPingNumeric.Value = SettingsLayoutHelper.Clamp(50, 2000, config.ServerConfig.MaxPing);
                maxPacketLossNumeric.Value = SettingsLayoutHelper.Clamp(1, 100, config.ServerConfig.MaxPacketLoss);
                upnpCheckBox.Checked = config.ServerConfig.UPNP;
                loopBackCheckBox.Checked = config.ServerConfig.LoopBack;
                bandwidthAlgCheckBox.Checked = config.StartupParameters.BandwidthAlg;

                UpdateModeVisibility();
                RefreshSimplePreview();
            }
            finally
            {
                suppressSimpleRecalculate = false;
            }
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            boundConfig.BasicConfig.NetworkSimpleMode = simpleModeRadio.Checked;
            boundConfig.BasicConfig.UploadBandwidthMbps = uploadMbpsNumeric.Value;

            if (simpleModeRadio.Checked)
            {
                int limitFps = GetEffectiveLimitFps();
                NetworkBandwidthCalculator.ApplySimpleSettings(
                    boundConfig.BasicConfig,
                    limitFps,
                    uploadMbpsNumeric.Value);
            }
            else
            {
                boundConfig.BasicConfig.MaxMsgSend = (int)maxMsgSendNumeric.Value;
                boundConfig.BasicConfig.MaxSizeGuaranteed = (int)maxSizeGuaranteedNumeric.Value;
                boundConfig.BasicConfig.MaxSizeNonguaranteed = (int)maxSizeNonguaranteedNumeric.Value;
                boundConfig.BasicConfig.MinBandwidth = (long)minBandwidthNumeric.Value;
                boundConfig.BasicConfig.MaxBandwidth = (long)maxBandwidthNumeric.Value;
                boundConfig.BasicConfig.MinErrorToSend = (double)minErrorNumeric.Value;
                boundConfig.BasicConfig.MinErrorToSendNear = (double)minErrorNearNumeric.Value;
                boundConfig.BasicConfig.MaxPacketSize = (int)maxPacketSizeNumeric.Value;
                boundConfig.BasicConfig.MaxCustomFileSize = (int)maxCustomFileSizeNumeric.Value;
            }

            boundConfig.ServerConfig.SteamProtocolMaxDataSize = (int)steamProtocolNumeric.Value;
            boundConfig.ServerConfig.DisconnectTimeout = (int)disconnectTimeoutNumeric.Value;
            boundConfig.ServerConfig.Maxdesync = (int)maxDesyncNumeric.Value;
            boundConfig.ServerConfig.MaxPing = (int)maxPingNumeric.Value;
            boundConfig.ServerConfig.MaxPacketLoss = (int)maxPacketLossNumeric.Value;
            boundConfig.ServerConfig.UPNP = upnpCheckBox.Checked;
            boundConfig.ServerConfig.LoopBack = loopBackCheckBox.Checked;
            boundConfig.StartupParameters.BandwidthAlg = bandwidthAlgCheckBox.Checked;
        }

        private Panel BuildSimpleModePanel()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(160);
            uploadMbpsNumeric = CreateMbpsNumeric(30m);
            limitFpsHintLabel = new Label
            {
                AutoSize = true,
                ForeColor = SystemColors.GrayText,
            };
            simplePreviewLabel = new Label
            {
                AutoSize = false,
                Height = 120,
                Width = 520,
                ForeColor = SystemColors.GrayText,
            };

            SettingsLayoutHelper.AddRow(layout, "最大上传带宽 (Mbps)", uploadMbpsNumeric);
            SettingsLayoutHelper.AddRow(layout, "LimitFPS", limitFpsHintLabel);
            SettingsLayoutHelper.AddRow(layout, "计算预览", simplePreviewLabel);

            var hint = new Label
            {
                AutoSize = true,
                MaximumSize = new Size(520, 0),
                ForeColor = SystemColors.GrayText,
                Text = "公式：峰值带宽 ≈ LimitFPS × MaxMsgSend × MaxPacketSize。LimitFPS 请在「性能」页设置；简易模式按 85% 上行留余量自动推算 basic.cfg 参数。",
            };
            SettingsLayoutHelper.AddRow(layout, string.Empty, hint);

            return WrapSection("basic.cfg 自动计算", layout);
        }

        private Panel BuildProfessionalModePanel()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(160);
            maxMsgSendNumeric = SettingsLayoutHelper.AddRow(
                layout,
                "MaxMsgSend",
                SettingsLayoutHelper.CreateNumeric(
                    NetworkBandwidthCalculator.MaxMsgSendMinimum,
                    NetworkBandwidthCalculator.MaxMsgSendMaximum,
                    128,
                    120));
            maxSizeGuaranteedNumeric = SettingsLayoutHelper.AddRow(layout, "MaxSizeGuaranteed", SettingsLayoutHelper.CreateNumeric(1, 4096, 512, 120));
            maxSizeNonguaranteedNumeric = SettingsLayoutHelper.AddRow(layout, "MaxSizeNonguaranteed", SettingsLayoutHelper.CreateNumeric(1, 4096, 256, 120));
            minBandwidthNumeric = SettingsLayoutHelper.AddRow(layout, "MinBandwidth", SettingsLayoutHelper.CreateNumeric(0, int.MaxValue, 256, 120));
            maxBandwidthNumeric = SettingsLayoutHelper.AddRow(layout, "MaxBandwidth", SettingsLayoutHelper.CreateNumeric(0, int.MaxValue, 1048576000, 120));
            minErrorNumeric = SettingsLayoutHelper.AddRow(layout, "MinErrorToSend", CreateErrorNumeric(0.001m));
            minErrorNearNumeric = SettingsLayoutHelper.AddRow(layout, "MinErrorToSendNear", CreateErrorNumeric(0.001m));
            maxPacketSizeNumeric = SettingsLayoutHelper.AddRow(layout, "MaxPacketSize", SettingsLayoutHelper.CreateNumeric(256, 4096, 1400, 120));
            maxCustomFileSizeNumeric = SettingsLayoutHelper.AddRow(layout, "MaxCustomFileSize", SettingsLayoutHelper.CreateNumeric(1, 65536, 1024, 120));

            return WrapSection("basic.cfg 专业参数", layout);
        }

        private Panel BuildCommonPanel()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(160);
            steamProtocolNumeric = SettingsLayoutHelper.AddRow(layout, "SteamProtocolMaxDataSize", SettingsLayoutHelper.CreateNumeric(256, 4096, 1024, 120));
            disconnectTimeoutNumeric = SettingsLayoutHelper.AddRow(layout, "DisconnectTimeout", SettingsLayoutHelper.CreateNumeric(1, 300, 10, 120));
            maxDesyncNumeric = SettingsLayoutHelper.AddRow(layout, "MaxDesync", SettingsLayoutHelper.CreateNumeric(1, 1000, 150, 120));
            maxPingNumeric = SettingsLayoutHelper.AddRow(layout, "MaxPing", SettingsLayoutHelper.CreateNumeric(50, 2000, 300, 120));
            maxPacketLossNumeric = SettingsLayoutHelper.AddRow(layout, "MaxPacketLoss", SettingsLayoutHelper.CreateNumeric(1, 100, 50, 120));
            upnpCheckBox = SettingsLayoutHelper.AddRow(layout, "UPNP", new CheckBox { Text = "启用 UPNP", AutoSize = true });
            loopBackCheckBox = SettingsLayoutHelper.AddRow(layout, "LoopBack", new CheckBox { Text = "LAN 模式", AutoSize = true });
            bandwidthAlgCheckBox = SettingsLayoutHelper.AddRow(layout, "BandwidthAlg", new CheckBox { Text = "实验性带宽算法 (-bandwidthAlg=2)", AutoSize = true });

            return WrapSection("server.cfg / 启动参数", layout);
        }

        private static Panel WrapSection(string title, Control content)
        {
            content.Dock = DockStyle.Top;
            content.AutoSize = true;

            var panel = new Panel
            {
                AutoSize = true,
                Dock = DockStyle.Top,
                Padding = new Padding(0, 0, 0, 12),
            };

            var header = new Label
            {
                Text = title,
                AutoSize = true,
                Font = new Font(SystemFonts.DefaultFont, FontStyle.Bold),
                Padding = new Padding(0, 0, 0, 6),
                Dock = DockStyle.Top,
            };
            panel.Controls.Add(content);
            panel.Controls.Add(header);
            return panel;
        }

        private static RadioButton CreateModeRadio(string text, bool isChecked)
        {
            return new RadioButton
            {
                Text = text,
                AutoSize = true,
                Checked = isChecked,
                Margin = new Padding(0, 0, 16, 0),
            };
        }

        private static void AddStackRow(TableLayoutPanel stack, Control control)
        {
            int row = stack.RowCount;
            stack.RowCount++;
            stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            stack.Controls.Add(control, 0, row);
        }

        private void ModeRadio_CheckedChanged(object sender, EventArgs e)
        {
            if (suppressSimpleRecalculate)
            {
                return;
            }

            UpdateModeVisibility();
            RefreshSimplePreview();
        }

        private void SimpleInput_ValueChanged(object sender, EventArgs e)
        {
            if (suppressSimpleRecalculate)
            {
                return;
            }

            RefreshSimplePreview();
        }

        private void UpdateModeVisibility()
        {
            simpleModePanel.Visible = simpleModeRadio.Checked;
            professionalModePanel.Visible = professionalModeRadio.Checked;
        }

        private void RefreshSimplePreview()
        {
            if (!simpleModeRadio.Checked)
            {
                return;
            }

            int limitFps = GetEffectiveLimitFps();
            NetworkBandwidthEstimate estimate = NetworkBandwidthCalculator.CalculateSimpleSettings(
                limitFps,
                uploadMbpsNumeric.Value);

            var preview = new System.Text.StringBuilder();
            preview.AppendLine("MaxMsgSend = " + estimate.MaxMsgSend);
            if (estimate.IsMaxMsgSendCapped)
            {
                preview.AppendLine("（理论值 " + estimate.RawMaxMsgSend + "，已截断至上限 "
                    + NetworkBandwidthCalculator.MaxMsgSendMaximum + "）");
            }

            preview.AppendLine("MinBandwidth = " + estimate.MinBandwidth + " bps");
            preview.AppendLine("MaxBandwidth = " + estimate.MaxBandwidth + " bps");
            preview.AppendLine("MaxPacketSize = " + estimate.MaxPacketSize);
            decimal peakMbps = NetworkBandwidthCalculator.EstimatePeakUploadMbps(
                estimate.MaxMsgSend,
                limitFps,
                estimate.MaxPacketSize);
            preview.AppendLine("理论峰值 ≈ " + peakMbps.ToString("0.##") + " Mbps");
            preview.Append("有效上行预算 ≈ " + estimate.EffectiveUploadMbps.ToString("0.##") + " Mbps（"
                + (NetworkBandwidthCalculator.SafetyFactor * 100).ToString("0") + "% 余量）");
            if (estimate.ExceedsStabilityHintThreshold)
            {
                preview.AppendLine();
                preview.Append("提示：MaxMsgSend > "
                    + NetworkBandwidthCalculator.MaxMsgSendStabilityHintThreshold
                    + "，建议实机观察 FPS、CPU 与同步情况。");
            }

            simplePreviewLabel.Text = preview.ToString();
        }

        private void UpdateLimitFpsHint()
        {
            int limitFps = GetEffectiveLimitFps();
            limitFpsHintLabel.Text = limitFps + "（在「性能」页修改）";
        }

        private int GetEffectiveLimitFps()
        {
            if (boundConfig != null)
            {
                return boundConfig.StartupParameters.LimitFPS;
            }

            return 50;
        }

        private static NumericUpDown CreateMbpsNumeric(decimal value)
        {
            return new NumericUpDown
            {
                Minimum = 0.1m,
                Maximum = 10000m,
                DecimalPlaces = 2,
                Increment = 1m,
                Value = value,
                Width = 120,
            };
        }

        private static NumericUpDown CreateErrorNumeric(decimal value)
        {
            return new NumericUpDown
            {
                Minimum = 0,
                Maximum = 1,
                DecimalPlaces = 3,
                Increment = 0.001m,
                Value = value,
                Width = 120,
            };
        }

        private static decimal ClampDecimal(NumericUpDown numeric, decimal value)
        {
            if (value < numeric.Minimum)
            {
                return numeric.Minimum;
            }

            if (value > numeric.Maximum)
            {
                return numeric.Maximum;
            }

            return value;
        }
    }
}

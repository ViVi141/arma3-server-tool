using System;
using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;
using AntCheckbox = AntdUI.Checkbox;
using AntInputNumber = AntdUI.InputNumber;
using AntLabel = AntdUI.Label;
using AntRadio = AntdUI.Radio;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class NetworkSettingsPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntRadio simpleModeRadio;
        private readonly AntRadio professionalModeRadio;
        private readonly Control simpleModePanel;
        private readonly Control professionalModePanel;
        private readonly TableLayoutPanel modeContentSlot;
        private AntInputNumber uploadMbpsNumeric;
        private AntLabel limitFpsHintLabel;
        private AntLabel simplePreviewLabel;
        private AntInputNumber maxMsgSendNumeric;
        private AntInputNumber maxSizeGuaranteedNumeric;
        private AntInputNumber maxSizeNonguaranteedNumeric;
        private AntInputNumber minBandwidthNumeric;
        private AntInputNumber maxBandwidthNumeric;
        private AntInputNumber minErrorNumeric;
        private AntInputNumber minErrorNearNumeric;
        private AntInputNumber maxPacketSizeNumeric;
        private AntInputNumber maxCustomFileSizeNumeric;
        private AntInputNumber steamProtocolNumeric;
        private AntInputNumber disconnectTimeoutNumeric;
        private AntInputNumber maxDesyncNumeric;
        private AntInputNumber maxPingNumeric;
        private AntInputNumber maxPacketLossNumeric;
        private AntCheckbox upnpCheckBox;
        private AntCheckbox loopBackCheckBox;
        private AntCheckbox bandwidthAlgCheckBox;

        private ArmaServerConfig boundConfig;
        private bool suppressSimpleRecalculate;

        public NetworkSettingsPanel()
        {
            Dock = DockStyle.Fill;

            var rootLayout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            simpleModeRadio = AntdUiHelper.CreateRadio("简易（按上行带宽自动计算）", false);
            professionalModeRadio = AntdUiHelper.CreateRadio("专业（手动调整全部参数）", true);
            Control modePanel = SettingsLayoutHelper.CreateHorizontalGroup(simpleModeRadio, professionalModeRadio);
            SettingsLayoutHelper.AddRow(rootLayout, "配置模式", modePanel);

            simpleModePanel = BuildSimpleModePanel();
            professionalModePanel = BuildProfessionalModePanel();
            Control commonPanel = BuildCommonPanel();

            modeContentSlot = SettingsLayoutHelper.CreateSectionsStack();
            var stack = SettingsLayoutHelper.CreateSectionsStack();
            SettingsLayoutHelper.AddStackSection(stack, modeContentSlot);
            SettingsLayoutHelper.AddStackSection(stack, commonPanel);

            int stackRow = rootLayout.RowCount;
            rootLayout.RowCount++;
            rootLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            rootLayout.Controls.Add(stack, 0, stackRow);
            rootLayout.SetColumnSpan(stack, 2);

            simpleModeRadio.CheckedChanged += ModeRadio_CheckedChanged;
            professionalModeRadio.CheckedChanged += ModeRadio_CheckedChanged;
            uploadMbpsNumeric.ValueChanged += SimpleInput_ValueChanged;

            Controls.Add(SettingsLayoutHelper.CreateScrollHost(rootLayout));
            SetActiveModePanel();
            RefreshSimplePreview();
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
                maxSizeGuaranteedNumeric.Value =
                    SettingsLayoutHelper.Clamp(1, 4096, config.BasicConfig.MaxSizeGuaranteed);
                maxSizeNonguaranteedNumeric.Value =
                    SettingsLayoutHelper.Clamp(1, 4096, config.BasicConfig.MaxSizeNonguaranteed);
                minBandwidthNumeric.Value = config.BasicConfig.MinBandwidth;
                maxBandwidthNumeric.Value = config.BasicConfig.MaxBandwidth;
                minErrorNumeric.Value = (decimal)config.BasicConfig.MinErrorToSend;
                minErrorNearNumeric.Value = (decimal)config.BasicConfig.MinErrorToSendNear;
                maxPacketSizeNumeric.Value =
                    SettingsLayoutHelper.Clamp(256, 4096, config.BasicConfig.MaxPacketSize);
                maxCustomFileSizeNumeric.Value =
                    SettingsLayoutHelper.Clamp(1, 65536, config.BasicConfig.MaxCustomFileSize);
                steamProtocolNumeric.Value =
                    SettingsLayoutHelper.Clamp(256, 4096, config.ServerConfig.SteamProtocolMaxDataSize);
                disconnectTimeoutNumeric.Value =
                    SettingsLayoutHelper.Clamp(1, 300, config.ServerConfig.DisconnectTimeout);
                maxDesyncNumeric.Value =
                    SettingsLayoutHelper.Clamp(1, 1000, config.ServerConfig.Maxdesync);
                maxPingNumeric.Value =
                    SettingsLayoutHelper.Clamp(50, 2000, config.ServerConfig.MaxPing);
                maxPacketLossNumeric.Value =
                    SettingsLayoutHelper.Clamp(1, 100, config.ServerConfig.MaxPacketLoss);
                upnpCheckBox.Checked = config.ServerConfig.UPNP;
                loopBackCheckBox.Checked = config.ServerConfig.LoopBack;
                bandwidthAlgCheckBox.Checked = config.StartupParameters.BandwidthAlg;

                SetActiveModePanel();
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

        private Control BuildSimpleModePanel()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            uploadMbpsNumeric =
                SettingsLayoutHelper.CreateDecimalNumeric(0.1m, 10000m, 30m, 120, 2);
            limitFpsHintLabel = AntdUiHelper.CreateHintLabel(string.Empty, 520);
            simplePreviewLabel = new AntLabel
            {
                AutoSizeMode = AntdUI.TAutoSize.None,
                Height = UiScaleHelper.Scale(120),
                Width = UiScaleHelper.Scale(520),
                ForeColor = Color.Gray,
            };

            SettingsLayoutHelper.AddRow(layout, "最大上传带宽 (Mbps)", uploadMbpsNumeric);
            SettingsLayoutHelper.AddRow(layout, "帧率上限", limitFpsHintLabel);
            SettingsLayoutHelper.AddRow(layout, "计算预览", simplePreviewLabel, 120);

            var hint = AntdUiHelper.CreateHintLabel(
                "公式：峰值带宽 ≈ 帧率上限 × 单帧最大消息数 × 最大数据包大小。帧率上限请在「性能」页设置；简易模式按 85% "
                    + "上行留余量自动推算 basic.cfg 参数。",
                520);
            SettingsLayoutHelper.AddRow(layout, string.Empty, hint, 72);

            return AntdUiHelper.CreateSection("basic.cfg 自动计算", layout);
        }

        private Control BuildProfessionalModePanel()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            maxMsgSendNumeric = SettingsLayoutHelper.AddRow(
                layout,
                "单帧最大消息数",
                SettingsLayoutHelper.CreateNumeric(
                    NetworkBandwidthCalculator.MaxMsgSendMinimum,
                    NetworkBandwidthCalculator.MaxMsgSendMaximum,
                    128,
                    120));
            maxSizeGuaranteedNumeric = SettingsLayoutHelper.AddRow(
                layout,
                "可靠包最大尺寸",
                SettingsLayoutHelper.CreateNumeric(1, 4096, 512, 120));
            maxSizeNonguaranteedNumeric = SettingsLayoutHelper.AddRow(
                layout,
                "非可靠包最大尺寸",
                SettingsLayoutHelper.CreateNumeric(1, 4096, 256, 120));
            minBandwidthNumeric =
                SettingsLayoutHelper.AddRow(layout, "最小带宽 (bps)", SettingsLayoutHelper.CreateNumeric(0, int.MaxValue, 256, 120));
            maxBandwidthNumeric = SettingsLayoutHelper.AddRow(
                layout,
                "最大带宽 (bps)",
                SettingsLayoutHelper.CreateNumeric(0, int.MaxValue, 1048576000, 120));
            minErrorNumeric = SettingsLayoutHelper.AddRow(
                layout,
                "同步误差阈值 (远)",
                SettingsLayoutHelper.CreateDecimalNumeric(0, 1m, 0.001m, 120, 3));
            minErrorNearNumeric = SettingsLayoutHelper.AddRow(
                layout,
                "同步误差阈值 (近)",
                SettingsLayoutHelper.CreateDecimalNumeric(0, 1m, 0.001m, 120, 3));
            maxPacketSizeNumeric =
                SettingsLayoutHelper.AddRow(layout, "最大数据包大小", SettingsLayoutHelper.CreateNumeric(256, 4096, 1400, 120));
            maxCustomFileSizeNumeric = SettingsLayoutHelper.AddRow(
                layout,
                "自定义文件上限 (KB)",
                SettingsLayoutHelper.CreateNumeric(1, 65536, 1024, 120));

            return AntdUiHelper.CreateSection("basic.cfg 专业参数", layout);
        }

        private Control BuildCommonPanel()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            steamProtocolNumeric = SettingsLayoutHelper.AddRow(
                layout,
                "Steam 协议数据上限",
                SettingsLayoutHelper.CreateNumeric(256, 4096, 1024, 120));
            disconnectTimeoutNumeric =
                SettingsLayoutHelper.AddRow(layout, "断线超时 (秒)", SettingsLayoutHelper.CreateNumeric(1, 300, 10, 120));
            maxDesyncNumeric =
                SettingsLayoutHelper.AddRow(layout, "最大不同步值", SettingsLayoutHelper.CreateNumeric(1, 1000, 150, 120));
            maxPingNumeric =
                SettingsLayoutHelper.AddRow(layout, "最大延迟 (ms)", SettingsLayoutHelper.CreateNumeric(50, 2000, 300, 120));
            maxPacketLossNumeric =
                SettingsLayoutHelper.AddRow(layout, "最大丢包率 (%)", SettingsLayoutHelper.CreateNumeric(1, 100, 50, 120));
            upnpCheckBox =
                SettingsLayoutHelper.AddRow(layout, "UPnP", SettingsLayoutHelper.CreateCheckbox("自动映射端口 (UPnP)", false));
            loopBackCheckBox =
                SettingsLayoutHelper.AddRow(layout, "局域网模式", SettingsLayoutHelper.CreateCheckbox("仅允许局域网连接", false));
            bandwidthAlgCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "带宽算法",
                SettingsLayoutHelper.CreateCheckbox("实验性带宽算法 (-bandwidthAlg=2)", false));

            return AntdUiHelper.CreateSection("server.cfg / 启动参数", layout);
        }

        private void SetActiveModePanel()
        {
            modeContentSlot.SuspendLayout();
            modeContentSlot.Controls.Clear();
            modeContentSlot.RowStyles.Clear();
            modeContentSlot.RowCount = 0;

            Control activePanel;
            if (simpleModeRadio.Checked)
            {
                activePanel = simpleModePanel;
            }
            else
            {
                activePanel = professionalModePanel;
            }

            activePanel.Visible = true;
            SettingsLayoutHelper.AddStackSection(modeContentSlot, activePanel);
            modeContentSlot.ResumeLayout(true);
            modeContentSlot.PerformLayout();
        }

        private void ModeRadio_CheckedChanged(object sender, EventArgs e)
        {
            if (suppressSimpleRecalculate)
            {
                return;
            }

            SetActiveModePanel();
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
            preview.AppendLine("单帧最大消息数 = " + estimate.MaxMsgSend);
            if (estimate.IsMaxMsgSendCapped)
            {
                preview.AppendLine("（理论值 " + estimate.RawMaxMsgSend + "，已截断至上限 "
                    + NetworkBandwidthCalculator.MaxMsgSendMaximum + "）");
            }

            preview.AppendLine("最小带宽 = " + estimate.MinBandwidth + " bps");
            preview.AppendLine("最大带宽 = " + estimate.MaxBandwidth + " bps");
            preview.AppendLine("最大数据包 = " + estimate.MaxPacketSize);
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
                preview.Append("提示：单帧最大消息数 > "
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

            return 60;
        }

        private static decimal ClampDecimal(AntInputNumber numeric, decimal value)
        {
            decimal min;
            if (numeric.Minimum.HasValue)
            {
                min = numeric.Minimum.Value;
            }
            else
            {
                min = decimal.MinValue;
            }

            decimal max;
            if (numeric.Maximum.HasValue)
            {
                max = numeric.Maximum.Value;
            }
            else
            {
                max = decimal.MaxValue;
            }

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

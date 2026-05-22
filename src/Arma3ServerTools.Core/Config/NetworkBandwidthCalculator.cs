using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Core.Config
{
    /// <summary>
    /// 根据上行带宽与 LimitFPS 估算 basic.cfg 网络参数。
    /// 峰值带宽 ≈ LimitFPS × MaxMsgSend × MaxPacketSize（bps）。
    /// </summary>
    public static class NetworkBandwidthCalculator
    {
        public const int DefaultMaxPacketSize = 1400;
        public const int DefaultMaxSizeGuaranteed = 512;
        public const int DefaultMaxSizeNonguaranteed = 256;
        public const double DefaultMinErrorToSend = 0.01;
        public const double DefaultMinErrorToSendNear = 0.001;
        public const int DefaultMaxCustomFileSize = 1024;
        public const double SafetyFactor = 0.85;
        public const long MinBandwidthFloorBps = 131072;

        /// <summary>basic.cfg MaxMsgSend 允许上限（社区高带宽调优常见 2048～4096）。</summary>
        public const int MaxMsgSendMaximum = 4096;

        /// <summary>超过此值时建议实机验证 CPU 与同步稳定性（BI 默认 128，教程常见 256～512）。</summary>
        public const int MaxMsgSendStabilityHintThreshold = 512;

        public static NetworkBandwidthEstimate CalculateSimpleSettings(int limitFps, decimal uploadBandwidthMbps)
        {
            long uploadBps = ToBitsPerSecond(uploadBandwidthMbps);
            long effectiveBps = (long)(uploadBps * SafetyFactor);
            int maxPacketSize = DefaultMaxPacketSize;
            int rawMaxMsgSend = CalculateRawMaxMsgSend(effectiveBps, limitFps, maxPacketSize);
            int maxMsgSend = Clamp(MaxMsgSendMinimum, MaxMsgSendMaximum, rawMaxMsgSend);
            long minBandwidth = CalculateMinBandwidth(uploadBps);

            return new NetworkBandwidthEstimate
            {
                MaxMsgSend = maxMsgSend,
                RawMaxMsgSend = rawMaxMsgSend,
                IsMaxMsgSendCapped = rawMaxMsgSend > MaxMsgSendMaximum,
                ExceedsStabilityHintThreshold = maxMsgSend > MaxMsgSendStabilityHintThreshold,
                MaxSizeGuaranteed = DefaultMaxSizeGuaranteed,
                MaxSizeNonguaranteed = DefaultMaxSizeNonguaranteed,
                MinBandwidth = minBandwidth,
                MaxBandwidth = uploadBps,
                MinErrorToSend = DefaultMinErrorToSend,
                MinErrorToSendNear = DefaultMinErrorToSendNear,
                MaxPacketSize = maxPacketSize,
                MaxCustomFileSize = DefaultMaxCustomFileSize,
                EffectiveBandwidthBps = effectiveBps,
            };
        }

        public static void ApplySimpleSettings(ServerBasic basic, int limitFps, decimal uploadBandwidthMbps)
        {
            NetworkBandwidthEstimate estimate = CalculateSimpleSettings(limitFps, uploadBandwidthMbps);
            estimate.ApplyTo(basic);
        }

        public const int MaxMsgSendMinimum = 1;

        public static int CalculateMaxMsgSend(long effectiveBandwidthBps, int limitFps, int maxPacketSize)
        {
            int rawMaxMsgSend = CalculateRawMaxMsgSend(effectiveBandwidthBps, limitFps, maxPacketSize);
            return Clamp(MaxMsgSendMinimum, MaxMsgSendMaximum, rawMaxMsgSend);
        }

        public static int CalculateRawMaxMsgSend(long effectiveBandwidthBps, int limitFps, int maxPacketSize)
        {
            if (limitFps <= 0 || maxPacketSize <= 0)
            {
                return 128;
            }

            long divisor = (long)limitFps * maxPacketSize;
            if (divisor <= 0)
            {
                return 128;
            }

            return (int)(effectiveBandwidthBps / divisor);
        }

        public static long CalculateMinBandwidth(long maxBandwidthBps)
        {
            long minBandwidth = maxBandwidthBps / 10;
            if (minBandwidth < MinBandwidthFloorBps)
            {
                minBandwidth = MinBandwidthFloorBps;
            }

            return minBandwidth;
        }

        public static decimal EstimatePeakUploadMbps(int maxMsgSend, int limitFps, int maxPacketSize)
        {
            if (limitFps <= 0 || maxPacketSize <= 0)
            {
                return 0;
            }

            return (decimal)maxMsgSend * limitFps * maxPacketSize / 1_000_000m;
        }

        public static decimal ReverseUploadMbps(int maxMsgSend, int limitFps, int maxPacketSize)
        {
            decimal peakMbps = EstimatePeakUploadMbps(maxMsgSend, limitFps, maxPacketSize);
            return peakMbps / (decimal)SafetyFactor;
        }

        public static long ToBitsPerSecond(decimal uploadBandwidthMbps)
        {
            if (uploadBandwidthMbps < 0)
            {
                uploadBandwidthMbps = 0;
            }

            return (long)(uploadBandwidthMbps * 1_000_000m);
        }

        private static int Clamp(int min, int max, int value)
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

    public sealed class NetworkBandwidthEstimate
    {
        public int MaxMsgSend { get; set; }

        public int RawMaxMsgSend { get; set; }

        public bool IsMaxMsgSendCapped { get; set; }

        public bool ExceedsStabilityHintThreshold { get; set; }

        public int MaxSizeGuaranteed { get; set; }

        public int MaxSizeNonguaranteed { get; set; }

        public long MinBandwidth { get; set; }

        public long MaxBandwidth { get; set; }

        public double MinErrorToSend { get; set; }

        public double MinErrorToSendNear { get; set; }

        public int MaxPacketSize { get; set; }

        public int MaxCustomFileSize { get; set; }

        public long EffectiveBandwidthBps { get; set; }

        public decimal EffectiveUploadMbps
        {
            get { return EffectiveBandwidthBps / 1_000_000m; }
        }

        public void ApplyTo(ServerBasic basic)
        {
            basic.MaxMsgSend = MaxMsgSend;
            basic.MaxSizeGuaranteed = MaxSizeGuaranteed;
            basic.MaxSizeNonguaranteed = MaxSizeNonguaranteed;
            basic.MinBandwidth = MinBandwidth;
            basic.MaxBandwidth = MaxBandwidth;
            basic.MinErrorToSend = MinErrorToSend;
            basic.MinErrorToSendNear = MinErrorToSendNear;
            basic.MaxPacketSize = MaxPacketSize;
            basic.MaxCustomFileSize = MaxCustomFileSize;
        }
    }
}

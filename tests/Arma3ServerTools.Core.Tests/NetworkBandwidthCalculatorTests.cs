using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;
using Xunit;

namespace Arma3ServerTools.Core.Tests
{
    public class NetworkBandwidthCalculatorTests
    {
        [Fact]
        public void CalculateMaxMsgSend_MatchesTutorialExampleOrderOfMagnitude()
        {
            long effectiveBps = 25500000;
            int maxMsgSend = NetworkBandwidthCalculator.CalculateMaxMsgSend(effectiveBps, 50, 1400);
            Assert.InRange(maxMsgSend, 350, 370);
        }

        [Fact]
        public void CalculateSimpleSettings_UsesSafetyFactorAndDefaults()
        {
            NetworkBandwidthEstimate estimate = NetworkBandwidthCalculator.CalculateSimpleSettings(50, 30m);

            Assert.Equal(512, estimate.MaxSizeGuaranteed);
            Assert.Equal(256, estimate.MaxSizeNonguaranteed);
            Assert.Equal(1400, estimate.MaxPacketSize);
            Assert.Equal(30000000, estimate.MaxBandwidth);
            Assert.True(estimate.MaxMsgSend >= 1);
            Assert.True(estimate.MaxMsgSend <= NetworkBandwidthCalculator.MaxMsgSendMaximum);
            Assert.InRange(estimate.MaxMsgSend, 360, 370);
            Assert.True(estimate.MinBandwidth >= NetworkBandwidthCalculator.MinBandwidthFloorBps);
            Assert.True(estimate.EffectiveUploadMbps <= 30m);
        }

        [Fact]
        public void CalculateSimpleSettings_200Mbps_60Fps_UsesUncappedMaxMsgSend()
        {
            NetworkBandwidthEstimate estimate = NetworkBandwidthCalculator.CalculateSimpleSettings(60, 200m);

            Assert.Equal(2023, estimate.MaxMsgSend);
            Assert.Equal(2023, estimate.RawMaxMsgSend);
            Assert.False(estimate.IsMaxMsgSendCapped);
            Assert.True(estimate.ExceedsStabilityHintThreshold);
            Assert.Equal(200000000, estimate.MaxBandwidth);

            decimal peakMbps = NetworkBandwidthCalculator.EstimatePeakUploadMbps(
                estimate.MaxMsgSend,
                60,
                estimate.MaxPacketSize);
            Assert.InRange(peakMbps, 169m, 171m);
        }

        [Fact]
        public void ApplySimpleSettings_WritesBasicConfigFields()
        {
            var basic = new ServerBasic();
            NetworkBandwidthCalculator.ApplySimpleSettings(basic, 50, 30m);

            Assert.True(basic.MaxMsgSend >= 1);
            Assert.Equal(512, basic.MaxSizeGuaranteed);
            Assert.Equal(256, basic.MaxSizeNonguaranteed);
            Assert.Equal(1400, basic.MaxPacketSize);
            Assert.Equal(30000000, basic.MaxBandwidth);
        }

        [Fact]
        public void ReverseUploadMbps_RoundTripsWithSafetyFactor()
        {
            decimal upload = 30m;
            NetworkBandwidthEstimate estimate = NetworkBandwidthCalculator.CalculateSimpleSettings(50, upload);
            decimal reversed = NetworkBandwidthCalculator.ReverseUploadMbps(
                estimate.MaxMsgSend,
                50,
                estimate.MaxPacketSize);

            Assert.InRange(reversed, 29m, 31m);
        }

        [Fact]
        public void EstimatePeakUploadMbps_MatchesFormula()
        {
            decimal peak = NetworkBandwidthCalculator.EstimatePeakUploadMbps(428, 50, 1400);
            Assert.InRange(peak, 29.9m, 30.0m);
        }
    }
}

using System;
using System.Collections.Generic;
using System.Net;
using System.Threading;
using BytexDigital.BattlEye.Rcon.Commands;
using BytexDigital.BattlEye.Rcon.Domain;
using Xunit;

namespace Arma3ServerTools.Core.Tests
{
    public class BattlEyeResponseParsingTests
    {
        private const string GuidAlpha = "a1b2c3d4e5f647891012345678901234";
        private const string GuidBravo = "b2c3d4e5f647891012345678901234ab";

        [Fact]
        public void GetPlayersRequest_Handle_ParsesPlayerRows()
        {
            var request = new GetPlayersRequest();
            request.Handle(
                "0 192.168.0.10:2304 45 " + GuidAlpha + "(OK) Alpha\n"
                + "1 10.0.0.2:2305 120 " + GuidBravo + "(OK) Bravo (Lobby)");

            List<Player> players = request.GetResponse();
            Assert.Equal(2, players.Count);

            Assert.Equal(0, players[0].Id);
            Assert.Equal("Alpha", players[0].Name);
            Assert.Equal(GuidAlpha, players[0].Guid);
            Assert.True(players[0].IsVerified);
            Assert.False(players[0].IsInLobby);
            Assert.Equal(new IPEndPoint(IPAddress.Parse("192.168.0.10"), 2304), players[0].RemoteEndpoint);

            Assert.Equal(1, players[1].Id);
            Assert.Equal("Bravo", players[1].Name);
            Assert.True(players[1].IsInLobby);
        }

        [Fact]
        public void GetBansRequest_Handle_ParsesGuidAndIpBans()
        {
            var request = new GetBansRequest();
            request.Handle(
                "0 " + GuidAlpha + " 3600 Speed hack\n"
                + "1 203.0.113.10 perm DDoS");

            List<PlayerBan> bans = request.GetResponse();
            Assert.Equal(2, bans.Count);

            Assert.Equal(0, bans[0].Id);
            Assert.Equal(GuidAlpha, bans[0].Guid);
            Assert.Equal(TimeSpan.FromSeconds(3600), bans[0].DurationLeft);
            Assert.Equal("Speed hack", bans[0].Reason);

            Assert.Equal(1, bans[1].Id);
            Assert.Equal(IPAddress.Parse("203.0.113.10"), bans[1].Ip);
            Assert.True(bans[1].IsPermanent);
            Assert.Equal("DDoS", bans[1].Reason);
        }
    }
}

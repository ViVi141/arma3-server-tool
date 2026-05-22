namespace Arma3ServerTools.Application.Monitoring
{
    public sealed class MonitoringPlayerStatRecord
    {
        public int Id { get; set; }

        public string PlayerId { get; set; }

        public string PlayerName { get; set; }

        public int InfantryKills { get; set; }

        public int SoftVehicleKills { get; set; }

        public int ArmorKills { get; set; }

        public int AirKills { get; set; }

        public int Deaths { get; set; }

        public int TotalScore { get; set; }

        public string CreateTime { get; set; }

        public int Online { get; set; }
    }

    public sealed class MonitoringObjectStatRecord
    {
        public int Id { get; set; }

        public int AllPlayers { get; set; }

        public int AllUnits { get; set; }

        public int Fps { get; set; }

        public int FpsMin { get; set; }

        public string CreateTime { get; set; }
    }
}

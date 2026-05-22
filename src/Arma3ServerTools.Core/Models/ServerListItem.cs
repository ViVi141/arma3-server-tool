namespace Arma3ServerTools.Core.Models
{
    /// <summary>
    /// Summary row for server list UI.
    /// </summary>
    public sealed class ServerListItem
    {
        public string ConfigName { get; set; }

        public string ServerUuid { get; set; }

        public string FileName { get; set; }

        public string SaveTime { get; set; }

        public string CreateTime { get; set; }
    }
}

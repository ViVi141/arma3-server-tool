using System.Collections.Generic;
using Arma3ServerTools.Application.Sync;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms
{
    internal sealed class ServerReloadBundle
    {
        public IReadOnlyDictionary<string, ArmaServerConfig> Configs { get; set; }

        public List<ServerGridRow> Rows { get; } = new List<ServerGridRow>();

        public Dictionary<string, string> PersistedSnapshots { get; } =
            new Dictionary<string, string>(System.StringComparer.Ordinal);

        public int ConfigReadCount { get; set; }

        public string Source { get; set; } = "memory";
    }
}

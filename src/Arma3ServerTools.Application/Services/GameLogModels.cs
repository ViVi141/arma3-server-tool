using System;
using System.Collections.Generic;

namespace Arma3ServerTools.Application.Services
{
    public static class GameLogKinds
    {
        public const string Rpt = "rpt";

        public const string BattlEye = "battleye";

        public const string All = "all";
    }

    public sealed class GameLogFileEntry
    {
        public string Kind { get; set; }

        public string Path { get; set; }

        public string FileName { get; set; }

        public DateTime LastWriteUtc { get; set; }

        public long SizeBytes { get; set; }
    }

    public sealed class GameLogReadResult
    {
        public bool Found { get; set; }

        public string Kind { get; set; }

        public string Path { get; set; }

        public string Content { get; set; }

        public int TailLines { get; set; }

        public IReadOnlyList<GameLogFileEntry> AvailableFiles { get; set; } = Array.Empty<GameLogFileEntry>();
    }
}

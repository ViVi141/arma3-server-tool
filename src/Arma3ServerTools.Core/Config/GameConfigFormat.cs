using System.Text;

namespace Arma3ServerTools.Core.Config
{
    internal static class GameConfigFormat
    {
        public static readonly UTF8Encoding Utf8NoBom = new UTF8Encoding(false);

        public const string DoubleQuotes = "\"";

        public const string LeftSquareBrackets = "{";

        public const string RightSquareBrackets = "}";

        public const string Semicolon = ";";

        public const string Comma = ",";

        public const string Tab = "    ";
    }
}

using System.Text.RegularExpressions;

namespace Arma3ServerTools.Core.Validation
{
    public static class PathValidation
    {
        private static readonly Regex ChinesePattern = new Regex(@"[\u4e00-\u9fa5]", RegexOptions.Compiled);

        public static bool ContainsChinese(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return false;
            }

            return ChinesePattern.IsMatch(value);
        }
    }
}

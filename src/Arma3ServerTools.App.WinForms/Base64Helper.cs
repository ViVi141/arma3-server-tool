using System;
using System.Text;

namespace Arma3ServerTools.App.WinForms
{
    /// <summary>
    /// 共享 Base64 编解码工具，使用 UTF-8 编码保证跨系统一致性。
    /// </summary>
    internal static class Base64Helper
    {
        /// <summary>
        /// 将普通文本编码为 Base64。空字符串和 null 直接返回空字符串。
        /// </summary>
        public static string Encode(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            return Convert.ToBase64String(Encoding.UTF8.GetBytes(value));
        }

        /// <summary>
        /// 将 Base64 字符串解码为普通文本。解码失败时返回空字符串。
        /// </summary>
        public static string Decode(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            try
            {
                return Encoding.UTF8.GetString(Convert.FromBase64String(value));
            }
            catch
            {
                return string.Empty;
            }
        }
    }
}

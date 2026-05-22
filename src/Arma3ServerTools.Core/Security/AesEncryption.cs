using System;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace Arma3ServerTools.Core.Security
{
    public static class AesEncryption
    {
        private static readonly byte[] Iv = Encoding.UTF8.GetBytes("3831219550000000");

        public static string Encrypt(string input, string key)
        {
            byte[] keyBytes = Encoding.UTF8.GetBytes(key.Substring(0, 32));
            using (Aes aes = Aes.Create())
            {
                aes.Key = keyBytes;
                aes.IV = Iv;
                ICryptoTransform encryptor = aes.CreateEncryptor(aes.Key, aes.IV);
                using (MemoryStream msEncrypt = new MemoryStream())
                {
                    using (CryptoStream csEncrypt = new CryptoStream(msEncrypt, encryptor, CryptoStreamMode.Write))
                    {
                        using (StreamWriter swEncrypt = new StreamWriter(csEncrypt))
                        {
                            swEncrypt.Write(input);
                        }

                        byte[] bytes = msEncrypt.ToArray();
                        return Convert.ToBase64String(Encoding.Default.GetBytes(BitConverter.ToString(bytes)));
                    }
                }
            }
        }

        public static string Decrypt(string input, string key)
        {
            byte[] outputb = Convert.FromBase64String(input);
            input = Encoding.UTF8.GetString(outputb);
            string[] sInput = input.Split("-".ToCharArray());
            byte[] inputBytes = new byte[sInput.Length];
            for (int i = 0; i < sInput.Length; i++)
            {
                inputBytes[i] = byte.Parse(sInput[i], NumberStyles.HexNumber);
            }

            byte[] keyBytes = Encoding.UTF8.GetBytes(key.Substring(0, 32));
            using (Aes aes = Aes.Create())
            {
                aes.Key = keyBytes;
                aes.IV = Iv;
                ICryptoTransform decryptor = aes.CreateDecryptor(aes.Key, aes.IV);
                using (MemoryStream msEncrypt = new MemoryStream(inputBytes))
                {
                    using (CryptoStream csEncrypt = new CryptoStream(msEncrypt, decryptor, CryptoStreamMode.Read))
                    {
                        using (StreamReader srEncrypt = new StreamReader(csEncrypt))
                        {
                            return srEncrypt.ReadToEnd();
                        }
                    }
                }
            }
        }
    }
}

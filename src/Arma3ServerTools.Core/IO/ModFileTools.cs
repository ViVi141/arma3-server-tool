using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Core.IO
{
    public static class ModFileTools
    {
        public static List<string> GetModDirectories(string path, string prefixFilter)
        {
            var result = new List<string>();
            if (!Directory.Exists(path))
            {
                return result;
            }

            string[] directories = Directory.GetDirectories(path);
            for (int i = 0; i < directories.Length; i++)
            {
                if (string.IsNullOrEmpty(prefixFilter) || directories[i].Contains(prefixFilter))
                {
                    result.Add(directories[i]);
                }
            }

            return result;
        }

        public static string GetDirectoryName(string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return string.Empty;
            }

            string normalized = path;
            if (normalized.LastIndexOf("\\", StringComparison.Ordinal) + 1 == normalized.Length)
            {
                normalized = normalized.Substring(0, normalized.Length - 1);
            }

            int index = normalized.LastIndexOf("\\", StringComparison.Ordinal);
            if (index < 0)
            {
                return normalized;
            }

            return normalized.Substring(index + 1);
        }

        public static ModMeta ReadModMeta(string modPath)
        {
            string metaPath = modPath + @"\meta.cpp";
            if (!File.Exists(metaPath))
            {
                return null;
            }

            try
            {
                var modMeta = new ModMeta();
                using (StreamReader reader = File.OpenText(metaPath))
                {
                    string line;
                    while ((line = reader.ReadLine()) != null)
                    {
                        if (line.Contains("name"))
                        {
                            string[] temp = line.Split(new[] { '=' }, StringSplitOptions.RemoveEmptyEntries);
                            if (temp.Length > 1)
                            {
                                modMeta.Name = temp[1].Trim().Replace(";", string.Empty).Replace("\"", string.Empty);
                            }
                        }

                        if (line.Contains("publishedid"))
                        {
                            string[] temp = line.Split(new[] { '=' }, StringSplitOptions.RemoveEmptyEntries);
                            if (temp.Length > 1)
                            {
                                modMeta.PublishedId = ParseLong(temp[1].Trim().Replace(";", string.Empty), 0);
                            }
                        }

                        if (line.Contains("timestamp"))
                        {
                            string[] temp = line.Split(new[] { '=' }, StringSplitOptions.RemoveEmptyEntries);
                            if (temp.Length > 1)
                            {
                                modMeta.TimeStamp = ParseLong(temp[1].Trim().Replace(";", string.Empty), 0);
                            }
                        }
                    }
                }

                return modMeta;
            }
            catch
            {
                return null;
            }
        }

        public static List<FileInfo> ListMissionFiles(string missionsDirectory)
        {
            var result = new List<FileInfo>();
            if (!Directory.Exists(missionsDirectory))
            {
                return result;
            }

            DirectoryInfo directory = new DirectoryInfo(missionsDirectory);
            foreach (FileInfo file in directory.GetFiles("*.pbo"))
            {
                result.Add(file);
            }

            return result;
        }

        public static long ParseLong(string value, long defaultValue)
        {
            long parsed;
            if (long.TryParse(value, out parsed))
            {
                return parsed;
            }

            return defaultValue;
        }
    }
}

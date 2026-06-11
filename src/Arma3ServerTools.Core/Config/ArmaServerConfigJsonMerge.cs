using System;
using Arma3ServerTools.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Arma3ServerTools.Core.Config
{
    /// <summary>
    /// RFC 7396-style JSON merge for partial Agent config updates.
    /// </summary>
    public static class ArmaServerConfigJsonMerge
    {
        public static ArmaServerConfig Merge(ArmaServerConfig existing, string patchJson)
        {
            if (existing == null)
            {
                throw new ArgumentNullException(nameof(existing));
            }

            if (string.IsNullOrWhiteSpace(patchJson))
            {
                throw new ArgumentException("PATCH 内容为空。", nameof(patchJson));
            }

            string existingJson = JsonConvert.SerializeObject(existing);
            JObject existingObject = JObject.Parse(existingJson);
            JObject patchObject = JObject.Parse(patchJson);
            existingObject.Merge(
                patchObject,
                new JsonMergeSettings
                {
                    MergeArrayHandling = MergeArrayHandling.Replace,
                    MergeNullValueHandling = MergeNullValueHandling.Merge,
                });

            ArmaServerConfig merged = existingObject.ToObject<ArmaServerConfig>();
            if (merged == null)
            {
                throw new InvalidOperationException("合并后无法反序列化为 ArmaServerConfig。");
            }

            return merged;
        }
    }
}

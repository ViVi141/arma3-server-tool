using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace Arma3ServerTools.Core.IO
{
    public static class JsonSerializer
    {
        private static readonly JsonSerializerSettings Settings = CreateSettings();

        public static string ToJson(object obj)
        {
            return JsonConvert.SerializeObject(obj, Formatting.Indented, Settings);
        }

        public static T FromJson<T>(string json)
        {
            return JsonConvert.DeserializeObject<T>(json, Settings);
        }

        public static object FromJson(string json, System.Type type)
        {
            return JsonConvert.DeserializeObject(json, type, Settings);
        }

        private static JsonSerializerSettings CreateSettings()
        {
            var settings = new JsonSerializerSettings();
            var timeConverter = new IsoDateTimeConverter
            {
                DateTimeFormat = "yyyy'-'MM'-'dd' 'HH':'mm':'ss",
            };
            settings.Converters.Add(timeConverter);
            return settings;
        }
    }
}

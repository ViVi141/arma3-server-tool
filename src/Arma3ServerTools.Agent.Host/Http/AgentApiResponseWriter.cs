using System.Threading.Tasks;
using Arma3ServerTools.Application.Automation;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json;

namespace Arma3ServerTools.Agent.Host.Http
{
    public static class AgentApiResponseWriter
    {
        public static async Task WriteEnvelopeAsync<T>(HttpContext context, int statusCode, AgentApiEnvelope<T> envelope)
        {
            context.Response.StatusCode = statusCode;
            context.Response.ContentType = "application/json; charset=utf-8";
            string json = JsonConvert.SerializeObject(envelope);
            await context.Response.WriteAsync(json).ConfigureAwait(false);
        }

        public static string GetRequestId(HttpContext context)
        {
            if (context.Items.TryGetValue(AgentRequestContext.RequestIdItemKey, out object value)
                && value is string requestId)
            {
                return requestId;
            }

            return string.Empty;
        }

        public static AgentApiEnvelope<T> Ok<T>(HttpContext context, T data)
        {
            return AgentApiEnvelope<T>.Ok(data, GetRequestId(context));
        }

        public static AgentApiEnvelope<T> Fail<T>(HttpContext context, string code, string message)
        {
            return AgentApiEnvelope<T>.Fail(code, message, GetRequestId(context));
        }
    }
}

using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace Arma3ServerTools.Agent.Host.Http
{
    public sealed class AgentRequestIdMiddleware
    {
        private readonly RequestDelegate next;

        public AgentRequestIdMiddleware(RequestDelegate next)
        {
            this.next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            string requestId = Guid.NewGuid().ToString("N").Substring(0, 12);
            context.Items[AgentRequestContext.RequestIdItemKey] = requestId;
            context.Response.Headers["X-A3ST-Request-Id"] = requestId;
            context.Response.Headers["X-A3ST-Api-Version"] = "2";
            await next(context).ConfigureAwait(false);
        }
    }
}

using System.Net;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Agent;
using Microsoft.AspNetCore.Http;

namespace Arma3ServerTools.Agent.Host.Http
{
    public sealed class AgentAuthMiddleware
    {
        private readonly RequestDelegate next;
        private readonly AgentSettings settings;

        public AgentAuthMiddleware(RequestDelegate next, AgentSettings settings)
        {
            this.next = next;
            this.settings = settings ?? throw new System.ArgumentNullException(nameof(settings));
        }

        public async Task InvokeAsync(HttpContext context)
        {
            IPAddress remote = context.Connection.RemoteIpAddress;
            if (!AgentCallerAllowlist.IsCallerAllowed(settings.Http, remote))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(
                    new { success = false, message = "Caller IP not allowed." }).ConfigureAwait(false);
                return;
            }

            string path = context.Request.Path.Value ?? string.Empty;
            if (path.Equals("/api/v1/health", System.StringComparison.OrdinalIgnoreCase) ||
                path.Equals("/api/v1/actions", System.StringComparison.OrdinalIgnoreCase))
            {
                await next(context).ConfigureAwait(false);
                return;
            }

            if (!IsAuthorized(context.Request))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(
                    new { success = false, message = "Unauthorized" }).ConfigureAwait(false);
                return;
            }

            await next(context).ConfigureAwait(false);
        }

        private bool IsAuthorized(HttpRequest request)
        {
            if (string.IsNullOrWhiteSpace(settings.Http.ApiToken))
            {
                return true;
            }

            // 支持 Bearer Token (Authorization: Bearer <token>)
            string header = request.Headers.Authorization;
            if (!string.IsNullOrEmpty(header) && header.StartsWith("Bearer ", System.StringComparison.OrdinalIgnoreCase))
            {
                string token = header.Substring("Bearer ".Length).Trim();
                return string.Equals(token, settings.Http.ApiToken, System.StringComparison.Ordinal);
            }

            // 支持 X-API-Key Header (X-API-Key: <token>)
            string apiKey = request.Headers["X-API-Key"];
            if (!string.IsNullOrEmpty(apiKey))
            {
                return string.Equals(apiKey, settings.Http.ApiToken, System.StringComparison.Ordinal);
            }

            // 支持 query string token (?token=<token>)
            if (request.Query.TryGetValue("token", out Microsoft.Extensions.Primitives.StringValues values))
            {
                return string.Equals(values.ToString(), settings.Http.ApiToken, System.StringComparison.Ordinal);
            }

            return false;
        }
    }
}

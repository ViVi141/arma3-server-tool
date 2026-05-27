namespace Arma3ServerTools.Application.Automation
{
    public sealed class AgentApiError
    {
        public string Code { get; set; }

        public string Message { get; set; }
    }

    public sealed class AgentApiEnvelope<T>
    {
        public bool Success { get; set; }

        public T Data { get; set; }

        public AgentApiError Error { get; set; }

        public string RequestId { get; set; }

        public static AgentApiEnvelope<T> Ok(T data, string requestId)
        {
            return new AgentApiEnvelope<T>
            {
                Success = true,
                Data = data,
                Error = null,
                RequestId = requestId,
            };
        }

        public static AgentApiEnvelope<T> Fail(string code, string message, string requestId)
        {
            return new AgentApiEnvelope<T>
            {
                Success = false,
                Data = default,
                Error = new AgentApiError { Code = code, Message = message },
                RequestId = requestId,
            };
        }
    }
}

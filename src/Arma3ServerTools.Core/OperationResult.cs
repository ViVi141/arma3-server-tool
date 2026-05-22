namespace Arma3ServerTools.Core
{
    /// <summary>
    /// Uniform result for Core operations without UI dependencies.
    /// </summary>
    public sealed class OperationResult
    {
        public bool Success { get; private set; }

        public string Message { get; private set; }

        private OperationResult(bool success, string message)
        {
            Success = success;
            Message = message;
        }

        public static OperationResult Ok(string message = null)
        {
            return new OperationResult(true, message);
        }

        public static OperationResult Fail(string message)
        {
            return new OperationResult(false, message);
        }
    }
}

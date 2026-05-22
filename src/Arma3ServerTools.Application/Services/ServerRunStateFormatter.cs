namespace Arma3ServerTools.Application.Services
{
    public static class ServerRunStateFormatter
    {
        public static string ToDisplay(ServerRunState state)
        {
            if (state == ServerRunState.Running)
            {
                return "运行中";
            }

            if (state == ServerRunState.Stopped)
            {
                return "已停止";
            }

            return "未知";
        }
    }
}

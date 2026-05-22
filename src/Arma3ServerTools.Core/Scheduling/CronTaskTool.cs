namespace Arma3ServerTools.Core.Scheduling
{
    public static class CronTaskTool
    {
        public const int ActionRestart = 0;

        public const int ActionStart = 1;

        public const int ActionStop = 2;

        public const int ActionDetectRestart = 3;

        private static readonly string[] ActionLabels =
        {
            "重启服务器",
            "启动服务器",
            "停止服务器",
            "检测并重启",
        };

        public static string ActionToText(int action)
        {
            int index = NormalizeAction(action);
            return ActionLabels[index];
        }

        public static int ActionTextToAction(string actionText)
        {
            if (string.IsNullOrWhiteSpace(actionText))
            {
                return ActionRestart;
            }

            string trimmed = actionText.Trim();
            for (int i = 0; i < ActionLabels.Length; i++)
            {
                if (trimmed == ActionLabels[i])
                {
                    return i;
                }
            }

            return -1;
        }

        public static int NormalizeAction(int action)
        {
            if (action < ActionRestart)
            {
                return ActionRestart;
            }

            if (action > ActionDetectRestart)
            {
                return ActionDetectRestart;
            }

            return action;
        }

        public static int ResolveAction(int storedAction, string actionText)
        {
            int fromText = ActionTextToAction(actionText);
            if (fromText >= 0)
            {
                return fromText;
            }

            return NormalizeAction(storedAction);
        }
    }
}

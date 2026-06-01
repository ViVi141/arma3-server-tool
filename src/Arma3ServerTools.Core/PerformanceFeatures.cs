namespace Arma3ServerTools.Core
{
    /// <summary>
    /// 功能开关，用于控制性能优化功能的启用/禁用，支持回滚。
    /// </summary>
    public static class PerformanceFeatures
    {
        /// <summary>
        /// 启用异步操作（异步启动、停止、状态查询等）
        /// </summary>
        public static bool EnableAsyncOperations { get; set; } = true;

        /// <summary>
        /// 使用 System.Text.Json 进行序列化（而非 Newtonsoft.Json）
        /// </summary>
        public static bool UseSystemTextJson { get; set; } = false;

        /// <summary>
        /// 启用并行文件操作（配置文件并行写入）
        /// </summary>
        public static bool EnableParallelFileOps { get; set; } = true;

        /// <summary>
        /// 启用并发模组扫描
        /// </summary>
        public static bool EnableConcurrentModScanning { get; set; } = true;

        /// <summary>
        /// 启用数据库批量操作优化
        /// </summary>
        public static bool EnableDatabaseBatchOps { get; set; } = true;

        /// <summary>
        /// 启用启动参数长度验证
        /// </summary>
        public static bool EnableCommandLineLengthCheck { get; set; } = true;

        /// <summary>
        /// 启用进程验证超时机制
        /// </summary>
        public static bool EnableProcessVerificationTimeout { get; set; } = true;

        /// <summary>
        /// 启用扩展性能监控
        /// </summary>
        public static bool EnableExtendedPerformanceMonitoring { get; set; } = true;
    }
}

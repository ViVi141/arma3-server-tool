using System;
using System.Management;

namespace Arma3ServerTools.Core.Security
{
    public static class MachineCodeTools
    {
        private const string KeySuffix = "383121955";
        private const string DefaultPart = " ";

        public static string GetEncryptionKey()
        {
            return GetCpuInfo().Trim() + GetHDid().Trim() + GetMoAddress().Trim() + KeySuffix;
        }

        public static string GetCpuInfo()
        {
            try
            {
                using (ManagementClass cimobject = new ManagementClass("Win32_Processor"))
                {
                    foreach (ManagementObject mo in cimobject.GetInstances())
                    {
                        using (mo)
                        {
                            string processorId = GetPropertyString(mo, "ProcessorId");
                            if (!string.IsNullOrEmpty(processorId))
                            {
                                return processorId;
                            }
                        }
                    }
                }
            }
            catch
            {
                // WMI 不可用时使用默认值，与旧版缺省行为一致。
            }

            return DefaultPart;
        }

        public static string GetHDid()
        {
            try
            {
                using (ManagementClass cimobject = new ManagementClass("Win32_DiskDrive"))
                {
                    foreach (ManagementObject mo in cimobject.GetInstances())
                    {
                        using (mo)
                        {
                            string model = GetPropertyString(mo, "Model");
                            if (!string.IsNullOrEmpty(model))
                            {
                                return model;
                            }
                        }
                    }
                }
            }
            catch
            {
            }

            return DefaultPart;
        }

        public static string GetMoAddress()
        {
            try
            {
                using (ManagementClass mc = new ManagementClass("Win32_NetworkAdapterConfiguration"))
                {
                    foreach (ManagementObject mo in mc.GetInstances())
                    {
                        using (mo)
                        {
                            if (!IsIpEnabled(mo))
                            {
                                continue;
                            }

                            string macAddress = GetPropertyString(mo, "MacAddress");
                            if (!string.IsNullOrEmpty(macAddress))
                            {
                                return macAddress;
                            }
                        }
                    }
                }
            }
            catch
            {
            }

            return DefaultPart;
        }

        private static bool IsIpEnabled(ManagementBaseObject mo)
        {
            object value = mo["IPEnabled"];
            if (value == null)
            {
                return false;
            }

            if (value is bool enabled)
            {
                return enabled;
            }

            bool parsed;
            if (bool.TryParse(Convert.ToString(value), out parsed))
            {
                return parsed;
            }

            return false;
        }

        private static string GetPropertyString(ManagementBaseObject mo, string propertyName)
        {
            object value = mo[propertyName];
            if (value == null)
            {
                return string.Empty;
            }

            return Convert.ToString(value);
        }
    }
}

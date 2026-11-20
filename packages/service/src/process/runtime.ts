import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export interface ProcessRuntime {
  pid: number;
  executable: string;
  args: string[];
  workingDirectory: string;
  session: string;
}
export interface RuntimeInventory {
  complete: boolean;
  processes: ProcessRuntime[];
  unknownPids: number[];
}

/** 只在内部使用完整 argv，不向事件、检查点或日志写入可能含口令的启动参数。 */
export function parseProcArgv(raw: Buffer): string[] {
  if (!raw.length || raw[raw.length - 1] !== 0) throw new Error("进程 argv 不完整");
  return raw.toString("utf8").slice(0, -1).split("\0");
}
function linuxSession(stat: string, boot: string, pid: number): string {
  const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
  if (!/^\d+$/.test(fields[19] ?? "") || !boot.trim()) throw new Error("进程会话不可读取");
  return `${boot.trim()}:${pid}:${fields[19]}`;
}
export async function readLinuxRuntime(pid: number, procRoot = "/proc"): Promise<ProcessRuntime> {
  const root = path.join(procRoot, String(pid));
  const boot = await fs.readFile(path.join(procRoot, "sys/kernel/random/boot_id"), "utf8");
  const before = linuxSession(await fs.readFile(path.join(root, "stat"), "utf8"), boot, pid);
  const [executable, workingDirectory, raw] = await Promise.all([
    fs.realpath(path.join(root, "exe")), fs.realpath(path.join(root, "cwd")), fs.readFile(path.join(root, "cmdline")),
  ]);
  const after = linuxSession(await fs.readFile(path.join(root, "stat"), "utf8"), boot, pid);
  if (before !== after) throw new Error("采集期间进程身份变化");
  const args = parseProcArgv(raw);
  if (!args[0]) throw new Error("进程 argv 缺少可执行程序");
  return { pid, executable, workingDirectory, args: args.slice(1), session: after };
}

// Windows CIM 不提供 cwd；只读进程参数中的 CurrentDirectory，不能拿配置路径冒充实际 cwd。
// 通过 64 位 PowerShell 同时处理原生 64 位和 WOW64 进程；任何访问/布局异常均返回未知。
const WINDOWS_RUNTIME_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class A3stRuntimeReader {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr handle, IntPtr address, byte[] buffer, int size, out IntPtr read);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr handle, int infoClass, [Out] IntPtr[] info, int length, out int returned);
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CommandLineToArgvW(string line, out int count);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr ptr);
  static byte[] Read(IntPtr handle, long address, int size) {
    var data = new byte[size]; IntPtr count;
    if (address <= 0 || !ReadProcessMemory(handle, new IntPtr(address), data, size, out count) || count.ToInt64() != size) throw new Exception("RUNTIME_UNREADABLE");
    return data;
  }
  static long Pointer(IntPtr handle, long address, bool small) {
    var data = Read(handle, address, small ? 4 : 8);
    return small ? BitConverter.ToUInt32(data, 0) : BitConverter.ToInt64(data, 0);
  }
  public static string Cwd(int pid) {
    if (IntPtr.Size != 8) throw new Exception("RUNTIME_UNREADABLE");
    var handle = OpenProcess(0x410, false, pid);
    if (handle == IntPtr.Zero) throw new Exception("RUNTIME_UNREADABLE");
    try {
      int returned; var wow = new IntPtr[1]; var basic = new IntPtr[6];
      if (NtQueryInformationProcess(handle, 26, wow, 8, out returned) != 0) throw new Exception("RUNTIME_UNREADABLE");
      bool small = wow[0] != IntPtr.Zero; long peb;
      if (small) peb = wow[0].ToInt64();
      else {
        if (NtQueryInformationProcess(handle, 0, basic, 48, out returned) != 0) throw new Exception("RUNTIME_UNREADABLE");
        peb = basic[1].ToInt64();
      }
      long parameters = Pointer(handle, peb + (small ? 0x10 : 0x20), small);
      long current = parameters + (small ? 0x24 : 0x38);
      int length = BitConverter.ToUInt16(Read(handle, current, 2), 0);
      if (length == 0 || length % 2 != 0) throw new Exception("RUNTIME_UNREADABLE");
      long buffer = Pointer(handle, current + (small ? 4 : 8), small);
      return System.Text.Encoding.Unicode.GetString(Read(handle, buffer, length));
    } finally { CloseHandle(handle); }
  }
  public static string[] Argv(string line) {
    int count; IntPtr argv = CommandLineToArgvW(line, out count);
    if (argv == IntPtr.Zero || count < 1) throw new Exception("RUNTIME_UNREADABLE");
    try {
      var result = new string[count-1];
      for (int i=1; i<count; i++) result[i-1] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(argv, i*IntPtr.Size));
      return result;
    } finally { LocalFree(argv); }
  }
}
'@
$names = ConvertFrom-Json $env:A3ST_RUNTIME_NAMES
$ids = ConvertFrom-Json $env:A3ST_RUNTIME_PIDS
$found = @(Get-CimInstance Win32_Process | Where-Object { $names -contains $_.Name -or $ids -contains [int]$_.ProcessId })
$good = @(); $unknown = @()
foreach ($item in $found) {
  $target = [int]$item.ProcessId
  try {
    $before = (Get-Process -Id $target).StartTime.ToUniversalTime().Ticks.ToString()
    $cwd = [A3stRuntimeReader]::Cwd($target)
    $fresh = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $target)
    if (!$fresh.ExecutablePath -or !$fresh.CommandLine -or !$cwd) { throw 'RUNTIME_UNREADABLE' }
    $argv = @([A3stRuntimeReader]::Argv($fresh.CommandLine))
    $after = (Get-Process -Id $target).StartTime.ToUniversalTime().Ticks.ToString()
    if ($before -ne $after) { throw 'RUNTIME_CHANGED' }
    $good += @{ pid=$target; executable=$fresh.ExecutablePath; workingDirectory=$cwd; args=$argv; session=("{0}:{1}" -f $target,$after) }
  } catch { $unknown += $target }
}
@{ complete=$true; processes=@($good); unknownPids=@($unknown) } | ConvertTo-Json -Depth 6 -Compress
`;

/** 完整列举候选游戏进程，同时包括持久 PID；枚举失败不能当作所有服务器已停止。 */
export async function collectProcessRuntimes(executableNames: string[], knownPids: number[] = []): Promise<RuntimeInventory> {
  try {
    const names = [...new Set(executableNames.map((name) => path.basename(name)).filter(Boolean))];
    const pids = knownPids.filter((pid) => Number.isSafeInteger(pid) && pid > 0);
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(WINDOWS_RUNTIME_SCRIPT, "utf16le").toString("base64")], {
        encoding: "utf8", timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, A3ST_RUNTIME_NAMES: JSON.stringify(names), A3ST_RUNTIME_PIDS: JSON.stringify(pids) },
      });
      const data = JSON.parse(stdout.trim()) as RuntimeInventory;
      if (data.complete !== true || !Array.isArray(data.processes) || !Array.isArray(data.unknownPids)) throw new Error("进程清单无效");
      for (const item of data.processes) if (!Number.isSafeInteger(item.pid) || !Array.isArray(item.args) || item.args.some((arg) => typeof arg !== "string") || !path.isAbsolute(item.workingDirectory) || !path.isAbsolute(item.executable) || !item.session) throw new Error("进程证据无效");
      return data;
    }
    if (process.platform !== "linux") return { complete: false, processes: [], unknownPids: pids };
    const candidates = new Set(pids);
    for (const id of await fs.readdir("/proc")) {
      if (!/^\d+$/.test(id)) continue;
      try {
        const comm = (await fs.readFile(`/proc/${id}/comm`, "utf8")).trim();
        // Linux comm 最多 15 字节，完整身份仍由后面的 exe/argv/session 验证。
        if (names.some((name) => name.slice(0, 15) === comm)) candidates.add(Number(id));
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return { complete: false, processes: [], unknownPids: pids }; }
    }
    const result: RuntimeInventory = { complete: true, processes: [], unknownPids: [] };
    for (const pid of candidates) {
      try { result.processes.push(await readLinuxRuntime(pid)); }
      catch {
        try { await fs.stat(`/proc/${pid}`); result.unknownPids.push(pid); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.unknownPids.push(pid); }
      }
    }
    return result;
  } catch { return { complete: false, processes: [], unknownPids: [...knownPids] }; }
}

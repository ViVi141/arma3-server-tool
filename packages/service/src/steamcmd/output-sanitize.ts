/**
 * SteamCMD（尤其 Linux stdout）会输出 ANSI 颜色控制符；Web 终端按纯文本渲染，需剥离。
 */
const ANSI_CSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const ORPHAN_SGR_PATTERN = /\uFFFD?\[[0-9;]*m/g;
const LONE_ESC_PATTERN = /\u001B/g;
const LONE_REPLACEMENT_PATTERN = /\uFFFD/g;

export function sanitizeSteamCmdOutput(text: string): string {
  if (!text) {
    return text;
  }

  let result = text.replace(ANSI_CSI_PATTERN, "");
  result = result.replace(ORPHAN_SGR_PATTERN, "");
  result = result.replace(LONE_ESC_PATTERN, "");
  result = result.replace(LONE_REPLACEMENT_PATTERN, "");
  result = result.replace(/\r\n/g, "\n");
  result = result.replace(/\r/g, "\n");
  return result;
}

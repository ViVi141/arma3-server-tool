export function containsChinesePath(value: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(value);
}

export function validateServerPath(value: string): { valid: boolean; message: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, message: "路径不能为空" };
  }
  if (containsChinesePath(trimmed)) {
    return { valid: false, message: "路径不能包含中文字符" };
  }
  return { valid: true, message: "" };
}

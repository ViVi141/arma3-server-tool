/** 从剪贴板文本解析 Workshop ID（对齐 WinForms ModSettingsPanel） */
export function parseWorkshopIdsFromClipboard(text: string): number[] {
  const ids: number[] = [];
  const idPattern = /\bid=.*?(\d{5,12})\b/g;
  let match = idPattern.exec(text);
  while (match) {
    const id = Number(match[1]);
    if (id > 0 && !ids.includes(id)) {
      ids.push(id);
    }
    match = idPattern.exec(text);
  }

  if (ids.length > 0) {
    return ids;
  }

  const digitPattern = /\d{5,12}/g;
  match = digitPattern.exec(text);
  while (match) {
    const id = Number(match[0]);
    if (id > 0 && !ids.includes(id)) {
      ids.push(id);
    }
    match = digitPattern.exec(text);
  }
  return ids;
}

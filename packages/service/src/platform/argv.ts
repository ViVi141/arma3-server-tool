/** Split a command line respecting double-quoted segments (Arma / SteamCMD args). */
export function splitCommandLine(line: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === " " && !inQuotes) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += c;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

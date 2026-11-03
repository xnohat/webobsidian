/**
 * The existing property editor only round-trips simple scalars/lists. Keep every
 * other YAML document in source form, instead of silently dropping its structure.
 */
export function editableFrontmatter(yaml: string): boolean {
  let hasKey = false;
  let listIndent = '', canHaveList = false;
  const keys = new Set<string>();
  const scalar = (value: string) => !/[#{}\[\]|>&*!\\]/.test(value) &&
    !/^\s*['"]|['"]\s*$/.test(value) && !/:\s/.test(value) && !/^\s*-\s/.test(value);
  for (const line of yaml.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const pair = line.match(/^([\w .-]+?):\s*(.*)$/);
    if (pair) {
      if (keys.has(pair[1])) return false;
      keys.add(pair[1]); hasKey = true;
      const value = pair[2];
      listIndent = ''; canHaveList = value === '';
      if (/^\[.*\]$/.test(value)) {
        if (!value.slice(1,-1).split(',').every(scalar)) return false;
      } else if (!scalar(value) || /[\[\]]/.test(value)) return false;
    } else {
      const item = line.match(/^( +)- +(.+)$/);
      if (!hasKey || !canHaveList || !item || !scalar(item[2])) return false;
      if (listIndent && item[1] !== listIndent) return false;
      listIndent = item[1];
    }
  }
  return true;
}

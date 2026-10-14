/**
 * 扩展卡片标题的展示格式。
 *
 * 对齐参照 `utils/extensionDisplayName.js` 的 `formatExtensionCardTitle`：把 `-` / `_` 换成空格、
 * 逐词首字母大写，但 2–3 个字符的全大写词（PDF、MCP、API）原样保留。技能、工具与 MCP 三类
 * 卡片共用同一份。
 */
export const formatExtensionTitle = (value: unknown): string => {
  const text = String(value ?? '').trim();
  if (!text) return '';

  return text
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      /^[A-Z0-9]{2,3}$/.test(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(' ');
};

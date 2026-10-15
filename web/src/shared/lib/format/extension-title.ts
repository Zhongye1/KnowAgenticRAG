/** 扩展卡片标题的展示格式。 */
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

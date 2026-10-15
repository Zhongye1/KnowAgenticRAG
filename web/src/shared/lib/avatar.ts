/** 头像的兜底样式：首字母 + 按种子哈希挑的渐变底。 */

/** 五组渐变底；颜色全部走 token。 */
const AVATAR_BACKGROUNDS = [
  'linear-gradient(135deg, var(--main-600), var(--color-info-500))',
  'linear-gradient(135deg, var(--chart-palette-5), var(--chart-palette-9))',
  'linear-gradient(135deg, var(--chart-palette-7), var(--chart-palette-3))',
  'linear-gradient(135deg, var(--color-accent-500), var(--chart-palette-6))',
  'linear-gradient(135deg, var(--chart-palette-4), var(--color-error-500))',
] as const;

/** 取前两个字。 */
export const avatarInitials = (name: unknown): string => {
  const normalized = String(name ?? '').trim();
  if (!normalized) return '智能';

  return Array.from(normalized).slice(0, 2).join('');
};

/** 按种子挑一组渐变底；同一种子永远同一组。 */
export const avatarBackground = (seed: unknown): string => {
  const value = String(seed ?? '').trim() || 'avatar';
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }

  return AVATAR_BACKGROUNDS[hash % AVATAR_BACKGROUNDS.length]!;
};

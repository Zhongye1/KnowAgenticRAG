/**
 * 提及令牌的格式：`@类型:值`，值里含空白、引号或反斜杠时用引号包裹并转义。
 */

/** 类型 → 令牌前缀。 */
export const MENTION_TYPE_PREFIX = {
  file: 'file',
  knowledge: 'knowledge',
  mcp: 'mcp',
  skill: 'skill',
  subagent: 'subagent',
} as const;

export type MentionType = keyof typeof MENTION_TYPE_PREFIX;

/** 把类型与值拼成令牌；值含空白或引号/反斜杠时加引号并转义。 */
export function formatMentionToken(type: string, value: unknown): string {
  const prefix =
    MENTION_TYPE_PREFIX[type as MentionType] ?? type;
  const raw = String(value ?? '');
  if (/\s|["\\]/.test(raw)) {
    return `@${prefix}:"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  return `@${prefix}:${raw}`;
}

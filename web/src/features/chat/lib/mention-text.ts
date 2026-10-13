/**
 * 提及文本的解析与编辑。
 *
 * 输入框里的提及以令牌形式存在（`@file:报表.pdf`），渲染时换成展示名。这里的函数都是
 * 纯的：解析令牌、给令牌找展示名、定位正在输入的 `@` 查询、以及删除时把整个令牌一起
 * 吃掉——最后一条是「退格不能只删掉令牌一半」的保证。
 */
import { getDisplayFileName } from './message-attachments';
import { MENTION_TYPE_PREFIX } from './mention-token';

export { formatMentionToken, MENTION_TYPE_PREFIX } from './mention-token';
export type { MentionType } from './mention-token';

const TYPE_PATTERN = Object.values(MENTION_TYPE_PREFIX).join('|');

/** 令牌：`@类型:值` 或 `@类型:"带引号的值"`。 */
const MENTION_TOKEN_REGEX = new RegExp(
  `@(${TYPE_PATTERN}):(?:"((?:\\\\.|[^"\\\\])*)"|(\\S+))`,
  'g',
);

const unquote = (value: string): string => value.replace(/\\(["\\])/g, '$1');

export type MentionSegment = {
  kind: 'mention';
  raw: string;
  type: string;
  value: string;
  start: number;
  end: number;
};

export type TextSegment = {
  kind: 'text';
  text: string;
  start: number;
  end: number;
};

export type MentionTextSegment = MentionSegment | TextSegment;

/** 把文本切成「普通文本」与「提及令牌」两种片段。 */
export function parseMentionText(text: unknown): MentionTextSegment[] {
  const value = String(text ?? '');
  const segments: MentionTextSegment[] = [];
  let lastIndex = 0;

  MENTION_TOKEN_REGEX.lastIndex = 0;
  for (const match of value.matchAll(MENTION_TOKEN_REGEX)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const end = start + raw.length;

    if (start > lastIndex) {
      segments.push({
        kind: 'text',
        text: value.slice(lastIndex, start),
        start: lastIndex,
        end: start,
      });
    }

    const quotedValue = match[2];
    const rawValue = match[3];
    segments.push({
      kind: 'mention',
      raw,
      type: match[1] as string,
      value: quotedValue !== undefined ? unquote(quotedValue) : (rawValue as string),
      start,
      end,
    });

    lastIndex = end;
  }

  if (lastIndex < value.length) {
    segments.push({
      kind: 'text',
      text: value.slice(lastIndex),
      start: lastIndex,
      end: value.length,
    });
  }

  return segments;
}

/** 可提及的候选项；字段名各不相同，取到第一个有值的当展示名。 */
export type MentionCandidate = Record<string, unknown>;

export type MentionCandidates = {
  knowledgeBases?: MentionCandidate[];
  mcps?: MentionCandidate[];
  skills?: MentionCandidate[];
  subagents?: MentionCandidate[];
};

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value) return value;
  }

  return '';
};

/**
 * 建立「类型:值 → 展示名」的映射。
 *
 * 每个候选项可能有多个可被引用的标识（名称、标签、id、slug…），令牌里写的可能是其中
 * 任意一个，因此每个都要登记。
 */
export function buildMentionDisplayLabels(
  mention: MentionCandidates = {},
): Record<string, string> {
  const labels: Record<string, string> = {};
  const set = (type: string, value: unknown, label: string) => {
    const rawValue = String(value ?? '').trim();
    const display = String(label ?? '').trim();
    if (!rawValue || !display) return;

    labels[`${type}:${rawValue}`] = display;
  };

  for (const kb of mention.knowledgeBases ?? []) {
    const label = firstString(kb.name, kb.label, kb.kb_id, kb.value);
    set('knowledge', kb.name, label);
    set('knowledge', kb.label, label);
    set('knowledge', kb.kb_id, label);
    set('knowledge', kb.value, label);
  }

  for (const mcp of mention.mcps ?? []) {
    const label = firstString(mcp.name, mcp.label, mcp.slug, mcp.id, mcp.value);
    set('mcp', mcp.slug, label);
    set('mcp', mcp.id, label);
    set('mcp', mcp.value, label);
    set('mcp', mcp.name, label);
  }

  for (const skill of mention.skills ?? []) {
    const label = firstString(
      skill.name,
      skill.label,
      skill.slug,
      skill.id,
      skill.value,
    );
    set('skill', skill.slug, label);
    set('skill', skill.id, label);
    set('skill', skill.value, label);
    set('skill', skill.name, label);
  }

  for (const subagent of mention.subagents ?? []) {
    const label = firstString(
      subagent.name,
      subagent.label,
      subagent.id,
      subagent.value,
    );
    set('subagent', subagent.id, label);
    set('subagent', subagent.value, label);
    set('subagent', subagent.slug, label);
    set('subagent', subagent.name, label);
  }

  return labels;
}

/**
 * 令牌的展示名：先查映射表；文件类型退到路径最后一段；都没有时用值本身。
 */
export function getMentionDisplayLabel(
  type: string,
  value: unknown,
  displayLabels: Record<string, string> = {},
): string {
  const mapped = displayLabels[`${type}:${String(value ?? '')}`];
  if (mapped) return mapped;

  if (type === 'file') {
    const raw = String(value ?? '');
    const normalized = raw.replace(/\/+$/, '');

    return getDisplayFileName(normalized || raw, '文件');
  }

  return String(value ?? '').trim() || type;
}

/**
 * 光标前正在输入的 `@` 查询。
 *
 * 光标落在已有令牌内部时返回 `null`（那是在编辑令牌，不是在找候选）；查询词里出现
 * 第二个 `@`、冒号或空白时也返回 `null`（那不是一次提及查询）。
 */
export function findActiveMentionQuery(
  text: unknown,
  rawCaretOffset = 0,
): { start: number; end: number; query: string } | null {
  const value = String(text ?? '');
  const offset = Math.max(0, Math.min(rawCaretOffset, value.length));
  const segments = parseMentionText(value);
  const mentionAtCursor = segments.find(
    (segment) =>
      segment.kind === 'mention' &&
      offset > segment.start &&
      offset <= segment.end,
  );
  if (mentionAtCursor) return null;

  const beforeCursor = value.slice(0, offset);
  const atIndex = beforeCursor.lastIndexOf('@');
  if (atIndex === -1) return null;

  const query = beforeCursor.slice(atIndex + 1);
  // `@` 的检查在这里恒假（起点就是最后一个 `@`），保留冒号与空白的判定
  if (query.includes(':') || /\s/.test(query)) return null;

  return { start: atIndex, end: offset, query };
}

/** 替换一段区间；越界的起止会被夹到文本范围内。 */
export function replaceRawRange(
  text: unknown,
  start = 0,
  end = start,
  replacement = '',
): string {
  const value = String(text ?? '');
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));

  return value.slice(0, safeStart) + replacement + value.slice(safeEnd);
}

/**
 * 删除时把整个令牌一起吃掉。
 *
 * 返回 `null` 表示这次删除不涉及令牌，调用方按原生行为处理；返回区间时调用方应改为
 * 删除该区间。退格落在令牌右边界、或选区与令牌相交、或方向键跨过令牌时都要扩到整个令牌。
 */
export function expandMentionDeletionRange(
  text: unknown,
  start = 0,
  end = start,
  direction: 'backward' | 'forward' = 'backward',
  knownMentionRanges: Array<{ start: number; end: number }> = [],
): { start: number; end: number } | null {
  const value = String(text ?? '');
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));
  const cursor = safeStart;

  if (safeStart === safeEnd && direction === 'backward') {
    const known = knownMentionRanges.find(
      (mention) =>
        mention && cursor === mention.end && mention.start < mention.end,
    );
    if (known) return { start: known.start, end: known.end };
  }

  const mentions = parseMentionText(value).filter(
    (segment): segment is MentionSegment => segment.kind === 'mention',
  );

  if (safeStart !== safeEnd) {
    const touched = mentions.filter(
      (segment) => segment.start < safeEnd && segment.end > safeStart,
    );
    if (touched.length === 0) return null;

    return {
      start: Math.min(safeStart, ...touched.map((segment) => segment.start)),
      end: Math.max(safeEnd, ...touched.map((segment) => segment.end)),
    };
  }

  if (direction === 'forward') {
    const mention = mentions.find(
      (segment) => cursor >= segment.start && cursor < segment.end,
    );
    if (!mention) return null;

    // 令牌后面紧跟一个空格时一起吃掉，避免留下孤立的空格
    const includeTrailingSpace = value[mention.end] === ' ';

    return {
      start: mention.start,
      end: includeTrailingSpace ? mention.end + 1 : mention.end,
    };
  }

  const mention = mentions.find(
    (segment) => cursor > segment.start && cursor <= segment.end,
  );

  return mention ? { start: mention.start, end: mention.end } : null;
}

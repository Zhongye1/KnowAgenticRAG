/**
 * 提及候选资源的归一。
 *
 * 候选来自配置（知识库 / MCP / 技能 / 子智能体）与文件搜索。这里把它们统一成
 * `{value, label, type, tokenLabel}`：`value` 是插入后令牌里的值，`label` 是界面上
 * 显示的名字，`tokenLabel` 是直接可写进编辑器的令牌文本。
 */
import { formatMentionToken, type MentionType } from './mention-token';

export type MentionResourceItem = {
  /** 令牌里的值。 */
  value: string;
  /** 界面显示名。 */
  label: string;
  type: MentionType;
  /** 插入编辑器时写的令牌文本。 */
  tokenLabel: string;
  description: string;
  /** 知识库资源额外带上 `kb_id`，供需要按 id 操作的调用方使用。 */
  resourceId?: string;
};

/** 候选配置；字段名不统一，取到第一个有值的当标识。 */
export type MentionConfig = {
  knowledgeBases?: Array<Record<string, unknown>>;
  mcps?: Array<Record<string, unknown>>;
  skills?: Array<Record<string, unknown>>;
  subagents?: Array<Record<string, unknown>>;
};

export type MentionResourceItems = {
  knowledgeBases: MentionResourceItem[];
  mcps: MentionResourceItem[];
  skills: MentionResourceItem[];
  subagents: MentionResourceItem[];
};

const text = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value) return value;
  }

  return '';
};

function toResourceItem(
  type: MentionType,
  input: {
    value: unknown;
    label: unknown;
    description?: unknown;
    resourceId?: unknown;
  },
): MentionResourceItem | null {
  const value = text(input.value, input.label);
  if (!value) return null;

  const label = text(input.label, input.value);

  return {
    value,
    label,
    type,
    tokenLabel: formatMentionToken(type, label),
    description: text(input.description),
    ...(type === 'knowledge' && text(input.resourceId)
      ? { resourceId: text(input.resourceId) }
      : {}),
  };
}

/** 把候选配置归一成四类资源项；缺标识的条目丢掉。 */
export function buildMentionResourceItems(
  mention: MentionConfig = {},
): MentionResourceItems {
  const map = <T>(
    items: Array<Record<string, unknown>> | undefined,
    build: (item: Record<string, unknown>) => T | null,
  ): T[] => (items ?? []).map(build).filter((item): item is T => item !== null);

  return {
    knowledgeBases: map(mention.knowledgeBases, (kb) =>
      toResourceItem('knowledge', {
        value: kb.name,
        label: kb.name,
        description: kb.description,
        resourceId: kb.kb_id,
      }),
    ),
    mcps: map(mention.mcps, (mcp) =>
      toResourceItem('mcp', {
        value: mcp.slug ?? mcp.value ?? mcp.id ?? mcp.name,
        label: mcp.name ?? mcp.label,
        description: mcp.description,
      }),
    ),
    skills: map(mention.skills, (skill) =>
      toResourceItem('skill', {
        value: skill.slug ?? skill.value ?? skill.id ?? skill.name,
        label: skill.name ?? skill.label,
        description: skill.description,
      }),
    ),
    subagents: map(mention.subagents, (subagent) =>
      toResourceItem('subagent', {
        value: subagent.id ?? subagent.value ?? subagent.slug ?? subagent.name,
        label: subagent.name ?? subagent.label,
        description: subagent.description,
      }),
    ),
  };
}

/** 把搜索结果转成文件类型的资源项；目录不可提及，因此丢掉。 */
export function buildMentionFileItems(
  files: Array<{ name?: string; path?: string; is_dir?: boolean }> | undefined,
): MentionResourceItem[] {
  return (files ?? [])
    .filter((file) => !file.is_dir)
    .map((file): MentionResourceItem | null => {
      const value = text(file.path, file.name);
      if (!value) return null;

      return {
        value,
        label: text(file.name, file.path),
        type: 'file' as const,
        tokenLabel: formatMentionToken('file', value),
        description: '',
      };
    })
    .filter((item): item is MentionResourceItem => item !== null);
}

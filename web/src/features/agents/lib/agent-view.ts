/**
 * 智能体管理面板的视图逻辑。
 *
 * 搜索、排序、分组、统计与共享范围文案都是纯函数，面板只负责渲染与接线。
 */
import type { Agent } from '@/entities/agent';

export type AgentGroup = {
  key: 'agents' | 'subagents';
  title: string;
  agents: Agent[];
};

/** 搜索：名称、标识、后端任一命中即可（与参照同口径）。 */
export function filterAgents(agents: Agent[], keyword: string): Agent[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return agents;

  return agents.filter((agent) =>
    [agent.name, agent.slug, agent.backendId].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
}

/** 排序：内置优先，其次按名称（中文按本地顺序）。 */
export function sortAgents(agents: Agent[]): Agent[] {
  return [...agents].sort((left, right) => {
    if (left.isBuiltin !== right.isBuiltin) return left.isBuiltin ? -1 : 1;

    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

/** 按「智能体 / 子智能体」分组；空组不出现。 */
export function groupAgents(agents: Agent[]): AgentGroup[] {
  const sorted = sortAgents(agents);

  return [
    {
      key: 'agents' as const,
      title: '智能体',
      agents: sorted.filter((agent) => !agent.isSubagent),
    },
    {
      key: 'subagents' as const,
      title: '子智能体',
      agents: sorted.filter((agent) => agent.isSubagent),
    },
  ].filter((group) => group.agents.length > 0);
}

export type AgentStats = {
  total: number;
  builtin: number;
  manageable: number;
  /** 读范围是全局共享的个数。 */
  global: number;
};

/**
 * 读范围档位；没有共享配置或没设读范围时为 `null`。
 *
 * `null` 的语义是「仅所有者」——后端对没设共享范围的智能体给的是 `read_scope: null`，
 * 不能当成全局共享（`normalizeShareConfig` 的默认值是全局，因此这里读原文而不是归一结果）。
 */
export function agentReadAccessLevel(
  agent: Agent,
): 'global' | 'department' | 'user' | null {
  const readScope = agent.shareConfig?.read_scope;
  if (typeof readScope !== 'object' || readScope === null) return null;
  const level = (readScope as { access_level?: unknown }).access_level;
  return level === 'global' || level === 'department' || level === 'user'
    ? level
    : null;
}

/** 统计条上的四个数。 */
export function agentStats(agents: Agent[]): AgentStats {
  return {
    total: agents.length,
    builtin: agents.filter((agent) => agent.isBuiltin).length,
    manageable: agents.filter((agent) => agent.canManage).length,
    global: agents.filter((agent) => agentReadAccessLevel(agent) === 'global')
      .length,
  };
}

/** 一段共享范围的原文；不是对象时为 null。 */
const asScope = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** 一段共享范围里某个 id 列表的条数。 */
const idCount = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

/**
 * 一段共享范围的短标签；与参照 `getShareConfigLabel` 的 `scopeLabel` 同口径。
 *
 * 没设这一段时返回 `null`（调用方据此判断「只读」还是「读·管」）。
 */
const scopeLabel = (scope: unknown): string | null => {
  const record = asScope(scope);
  if (!record) return null;

  switch (record.access_level) {
    case 'global':
      return '全局';
    case 'department':
      return `部门(${idCount(record.department_ids)})`;
    case 'user':
      return `用户(${idCount(record.user_uids)})`;
    default:
      return null;
  }
};

/** 卡片上的共享范围标签；与参照 `getShareConfigLabel` 同口径。 */
export function agentShareLabel(agent: Agent): string {
  const scope = asScope(agent.shareConfig);
  const read = scopeLabel(scope?.read_scope);
  const manage = scopeLabel(scope?.manage_scope);

  // 两段都没设就是私有；后端对没设共享范围的智能体给的是 read_scope: null
  if (read === null && manage === null) return '仅所有者';
  if (manage === null) return `只读${read ?? '无'}`;

  return `读${read ?? '无'} · 管${manage}`;
}

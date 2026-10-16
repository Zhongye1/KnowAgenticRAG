/**
 * 智能体的领域读取。
 *
 * 端点在契约里已声明响应模型，`api` 段直接复用生成类型；这一层仍按不可信数据逐项读取：
 * 读不到就退到显式兜底，不猜。端点的形状与路径归 `api/agents-api.ts`。
 *
 * 标识统一用 `slug`：后端 `id` 是自增整数，`slug` 才是业务标识，会话与请求下发的也是它。
 */
export type Agent = {
  /** 下发给后端、写进会话、也用于路由跳转的字符串标识。 */
  slug: string;
  name: string;
  description: string;
  /** 配置的图标 URL；为空时由调用方用首字母兜底。 */
  icon: string;
  /** 所属后端；取值来自后端列表端点下发的 `backend_id`。 */
  backendId: string;
  isBuiltin: boolean;
  /** 子智能体不是用户可切换的对话入口，管理面板单独分组。 */
  isSubagent: boolean;
  /** 当前用户能不能改它。授权边界在后端，这里只用于禁用或隐藏入口。 */
  canManage: boolean;
  /**
   * 共享范围原文（后端已归一成 v2，两个 scope 都可能为 null）。
   *
   * **不在这里补默认值**：读范围缺失的语义是「仅所有者」，补成全局会把私有智能体显示成
   * 全局共享。展示与表单各按自己的口径读它（`features/agents` 的档位读取 / 共享表单的
   * `normalizeShareConfig`）。
   */
  shareConfig: Record<string, unknown> | null;
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * 一条原始智能体归一成领域对象；缺标识的条目丢掉。
 *
 * 没有标识的条目既下发不了也跳不过去，留着只会变成列表里一行点不动的死卡。
 */
export function toAgent(raw: unknown): Agent | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return null;
  const record = raw as Record<string, unknown>;
  const slug = asText(record.slug);
  if (!slug) return null;

  return {
    slug,
    name: asText(record.name) || slug,
    description: asText(record.description),
    icon: asText(record.icon),
    backendId: asText(record.backend_id),
    isBuiltin: record.is_builtin === true,
    isSubagent: record.is_subagent === true,
    canManage: record.can_manage === true,
    shareConfig:
      typeof record.share_config === 'object' && record.share_config !== null
        ? (record.share_config as Record<string, unknown>)
        : null,
  };
}

/** 列表归一；形状不符时返回空数组。 */
export function toAgents(raw: unknown): Agent[] {
  if (!Array.isArray(raw)) return [];

  return raw.map(toAgent).filter((agent): agent is Agent => agent !== null);
}

/** 一个可选的智能体后端。 */
export type AgentBackend = {
  id: string;
  name: string;
  description: string;
};

/** 后端归一；缺 `backend_id` 的条目丢掉（它才是创建时要下发的值）。 */
export function toAgentBackend(raw: unknown): AgentBackend | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return null;
  const record = raw as Record<string, unknown>;
  const id = asText(record.backend_id) || asText(record.id);
  if (!id) return null;

  return {
    id,
    name: asText(record.name) || id,
    description: asText(record.description),
  };
}

/** 后端列表归一；形状不符时返回空数组。 */
export function toAgentBackends(raw: unknown): AgentBackend[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map(toAgentBackend)
    .filter((backend): backend is AgentBackend => backend !== null);
}

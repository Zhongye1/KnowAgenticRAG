/**
 * 智能体候选项的归一与切换规则。
 *
 * 响应在契约里没有类型，字段按不可信数据处理：读不到就跳过这一条，不猜。
 *
 * **值用 `slug` 而不是 `id`**：后端 `agents.id` 是自增整数，`slug` 才是业务上的字符串
 * 标识；本仓会话与请求下发的一直是 `agentSlug`。
 */
export type AgentOption = {
  /** 下发给后端与写进会话的字符串标识。 */
  value: string;
  label: string;
  icon: string;
  isBuiltin: boolean;
};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * 归一成候选项：排除子智能体（它们不是用户可切换的入口），缺 `slug` 的条目丢掉。
 * 名称缺失时退到 `slug`——列表里出现一行空白比用标识更差。
 */
export function buildAgentOptions(agents: unknown): AgentOption[] {
  if (!Array.isArray(agents)) return [];

  return agents
    .map((raw): AgentOption | null => {
      const agent = (raw ?? {}) as Record<string, unknown>;
      if (agent.is_subagent === true) return null;

      const value = asText(agent.slug);
      if (!value) return null;

      return {
        value,
        label: asText(agent.name) || value,
        icon: asText(agent.icon),
        isBuiltin: agent.is_builtin === true,
      };
    })
    .filter((option): option is AgentOption => option !== null);
}

/** 选择器上显示的当前智能体名：加载中、找不到时的兜底文案与参照一致。 */
export function currentAgentLabel(
  options: AgentOption[],
  selected: string | null | undefined,
  loading = false,
): string {
  if (loading) return '加载中...';

  return options.find((option) => option.value === selected)?.label ?? '智能体';
}

/** 不能切换的原因；可以切换时返回 `null`。 */
export function agentSwitchBlockReason({
  hasActiveThread,
  isCreatingThread,
}: {
  hasActiveThread: boolean;
  isCreatingThread: boolean;
}): string | null {
  if (isCreatingThread) return '正在创建新对话，请稍候';
  // 会话一旦绑定智能体，中途换会让历史消息与当前智能体对不上
  if (hasActiveThread) return '当前对话已绑定智能体，请新建对话后切换';

  return null;
}

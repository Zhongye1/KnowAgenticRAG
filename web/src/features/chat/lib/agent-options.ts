/**
 * 智能体候选项与切换规则。
 *
 * 领域读取（wire → `Agent`，含标识与内置标记）在 `entities/agent`；这里只把它映射成选择器
 * 需要的形状，并持有「能不能切换」的规则。
 *
 * **值用 `slug` 而不是 `id`**：后端 `agents.id` 是自增整数，`slug` 才是业务上的字符串
 * 标识；本仓会话与请求下发的一直是 `agentSlug`。
 */
import type { Agent } from '@/entities/agent';

export type AgentOption = {
  /** 下发给后端与写进会话的字符串标识。 */
  value: string;
  label: string;
  icon: string;
  isBuiltin: boolean;
};

/**
 * 归一成候选项：排除子智能体（它们不是用户可切换的入口）。
 *
 * 标识与名称的兜底已经在 `toAgent` 里做过，这里不再重复判空。
 */
export function buildAgentOptions(agents: Agent[]): AgentOption[] {
  return agents
    .filter((agent) => !agent.isSubagent)
    .map((agent) => ({
      value: agent.slug,
      label: agent.name,
      icon: agent.icon,
      isBuiltin: agent.isBuiltin,
    }));
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

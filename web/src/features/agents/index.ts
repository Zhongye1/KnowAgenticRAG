/**
 * 智能体管理切片的对外接口。页面只从这里引用，不深入 `ui` / `lib` 内部。
 *
 * `Agent` 是 `entities/agent` 的类型，这里再导出一次是因为面板的 props 用到它：消费方
 * 不该为了给面板传参去直接依赖实体切片。
 */
export type { Agent } from '@/entities/agent';
export { AgentManagePanel } from './ui/agent-manage-panel';
export type { AgentManagePanelProps } from './ui/agent-manage-panel';
/** 卡片标签与页头统计芯片；同形态的小标签在这两处只有一份实现。 */
export { AgentCardTag, AgentSummaryChip } from './ui/agent-chip';
export { agentShareLabel, agentStats } from './lib/agent-view';
export { filterAgents, groupAgents, sortAgents } from './lib/agent-view';
export type { AgentGroup, AgentStats } from './lib/agent-view';

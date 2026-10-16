/**
 * 智能体切片的对外接口。其余层只从这里引用智能体能力，不深入 `api` / `model` 内部。
 */
export {
  createAgent,
  getAgentDetail,
  listAgentBackends,
  listAgents,
  removeAgent,
  updateAgent,
  uploadAgentIcon,
} from './api/agents-api';
export type { AgentCreatePayload, AgentUpdatePayload } from './api/agents-api';
export {
  toAgent,
  toAgentBackend,
  toAgentBackends,
  toAgents,
} from './model/agent-types';
export type { Agent, AgentBackend } from './model/agent-types';
export {
  AGENTS_QUERY_ROOT,
  agentBackendsQueryKey,
  agentsQueryKey,
  useAgentBackends,
  useAgents,
} from './model/agent-queries';
export type { AgentsQuery } from './model/agent-queries';
export {
  useCreateAgent,
  useRemoveAgent,
  useUpdateAgent,
} from './model/agent-mutations';

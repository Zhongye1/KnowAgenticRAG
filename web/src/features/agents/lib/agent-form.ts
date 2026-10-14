/**
 * 新增/编辑智能体的表单模型。
 *
 * 表单值 ↔ 请求体的换算与校验都在这里，对话框只负责渲染与提交。字段集合与参照的
 * 「基本信息」一致：名称、标识（仅新建可改）、后端（仅新建可改）、描述、图标。
 *
 * 两处刻意不在这里做：`is_subagent` 由后端按后端 id 推导（`resolve_agent_is_subagent`），
 * 共享范围在未指定时由后端落成「仅创建者可读」的默认值——都与参照的初值一致，客户端不重复表达。
 */
import type {
  Agent,
  AgentCreatePayload,
  AgentUpdatePayload,
} from '@/entities/agent';

export type AgentForm = {
  name: string;
  /** 留空时后端按名称生成。 */
  slug: string;
  backendId: string;
  description: string;
  icon: string;
};

/** 新建的初值：后端可预选，其余留空。 */
export const emptyAgentForm = (defaultBackendId = ''): AgentForm => ({
  name: '',
  slug: '',
  backendId: defaultBackendId,
  description: '',
  icon: '',
});

/** 编辑的初值；标识与后端不可改，只作展示。 */
export const agentFormFrom = (agent: Agent): AgentForm => ({
  name: agent.name,
  slug: agent.slug,
  backendId: agent.backendId,
  description: agent.description,
  icon: agent.icon,
});

/** 校验；返回第一条错误文案，通过时返回 `null`。 */
export function validateAgentForm(form: AgentForm): string | null {
  if (!form.name.trim()) return '请填写智能体名称';
  if (!form.backendId.trim()) return '请选择智能体后端';

  return null;
}

/** 表单 → 创建请求体；`slug` 留空交给后端生成。 */
export function buildAgentCreatePayload(form: AgentForm): AgentCreatePayload {
  return {
    name: form.name.trim(),
    slug: form.slug.trim() || null,
    backend_id: form.backendId.trim(),
    description: form.description.trim() || null,
    icon: form.icon.trim() || null,
  };
}

/** 表单 → 更新请求体；标识、后端与共享范围都不在这里改。 */
export function buildAgentUpdatePayload(form: AgentForm): AgentUpdatePayload {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    icon: form.icon.trim() || null,
  };
}

/**
 * 知识库对话（D25 SSE 事件协议）的 DTO 镜像。
 * 后端契约：POST /api/v1/knowledge_bases/{kb_name}/chat/stream（非流式为
 * POST .../chat，返回 ChatResponse 统一 JSON），
 * 事件流 step / meta / citation / delta / usage / done / error，data 行为 JSON。
 */

export type ChatRole = 'user' | 'assistant' | 'system';

/**
 * 问答模式（D35）：chat = /chat/stream 固定检索一次后生成；
 * agent = /agent/stream 服务端图编排（plan → act → grade/rewrite → generate）。
 */
export type ChatMode = 'chat' | 'agent';

export type ChatDoneReason = 'complete' | 'empty_result' | 'max_tokens';

/** D25 meta 事件载荷：{kb_name, mode, model_spec, hit_count} */
export interface ChatMeta {
  kb_name?: string;
  mode?: string;
  model_spec?: string;
  hit_count?: number;
}

/** D24 引用条目（citation 事件载荷的 citations 数组元素） */
export interface ChatCitation {
  n: number;
  kb_name: string;
  document_id: string;
  version_id?: number;
  chunk_id: string;
  source?: string;
  score?: number;
  content: string;
}

/** D25 usage 事件载荷 */
export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** 随问文本附件（对齐后端 ChatAttachment：≤4 个、单个 ≤32KB） */
export interface ChatRequestAttachment {
  filename: string;
  content: string;
}

/** 单轮对话的运行期信息（按 assistant 消息 ID 关联，供 UI 渲染） */
export interface ChatRunInfo {
  meta?: ChatMeta;
  citations?: ChatCitation[];
  /** 视觉来源（agent 的 citation/done 事件携带；chat 恒为空） */
  images?: ChatImageSource[];
  /** 执行轨迹（step 事件按到达顺序累积） */
  steps?: ChatStep[];
  usage?: ChatUsage;
  doneReason?: ChatDoneReason | string;
  /** Agent 规划/自省元数据（done.agent，仅 /agent 端点） */
  agent?: ChatAgentInfo;
}

/** D25 step 事件载荷（chat 的 recall/rerank/hydrate；agent 的 plan/act/grade/rewrite/generate） */
export interface ChatStep {
  name: string;
  detail?: string;
}

/** 视觉来源条目（citation/done 事件的 images 数组元素，经 /rag/images 回源） */
export interface ChatImageSource {
  type?: string;
  image_id: string;
  image_path?: string;
  document_id?: string;
  kb_name?: string;
  page?: number;
  position?: string;
  chunk_type?: string;
  parent_section?: string;
  content_summary?: string;
  score?: number;
}

/** Agent 规划与自省元数据（done.agent，仅 /agent 端点携带） */
export interface ChatAgentInfo {
  need_retrieval?: boolean;
  sub_queries?: string[];
  plan_rationale?: string;
  grade_score?: number;
  rewrites?: number;
  tool_calls?: number;
  /** 工具调用按工具名分桶（后端 done.agent.tool_calls_by_name） */
  tool_calls_by_name?: Record<string, number>;
}

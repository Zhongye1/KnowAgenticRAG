/**
 * 知识库对话（D25 SSE 事件协议）的 DTO 镜像。
 * 后端契约：POST /api/v1/knowledge_bases/{kb_name}/chat/stream（非流式为
 * POST .../chat，返回 ChatResponse 统一 JSON），
 * 事件流 step / meta / citation / delta / usage / done / error，data 行为 JSON。
 */

export type ChatRole = 'user' | 'assistant' | 'system';

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
  usage?: ChatUsage;
  doneReason?: ChatDoneReason | string;
}

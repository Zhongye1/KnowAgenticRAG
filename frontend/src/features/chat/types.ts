/**
 * 知识库对话（D25 SSE 事件协议）的 DTO 镜像。
 * 后端契约：POST /api/v1/knowledge_bases/{kb_name}/chat，
 * 事件流 meta / citation / delta / usage / done / error，data 行为 JSON。
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

/** 单轮对话的运行期信息（按 assistant 消息 ID 关联，供 UI 渲染） */
export interface ChatRunInfo {
  meta?: ChatMeta;
  citations?: ChatCitation[];
  usage?: ChatUsage;
  doneReason?: ChatDoneReason | string;
}

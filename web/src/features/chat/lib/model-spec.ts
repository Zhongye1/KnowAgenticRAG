/**
 * 当前模型的回退链。
 *
 * 对齐参照 `AgentChatComponent.vue` 的 `currentModelSpec`：按会话的覆盖 → 会话
 * `metadata.model_spec` → 智能体配置里的 `model` → 系统配置的 `default_model`。
 *
 * 覆盖只活在页面会话里（参照也是组件内存），刷新后由后端绑定在会话上的值接手：每次创建 run
 * 时后端都会把最终模型写进会话的 `metadata.model_spec`（`agent_request_queue_service` 的
 * `set_model_spec`），因此前端不需要自己持久化这次选择。
 */

/** 草稿态（还没有会话）的覆盖键；与参照同值。 */
export const DRAFT_MODEL_KEY = '__draft__';

/** 覆盖表的键：有会话用会话 id，没有会话用草稿键。 */
export const modelOverrideKey = (threadId: string | null | undefined): string =>
  threadId || DRAFT_MODEL_KEY;

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/** 会话 metadata 里的模型绑定。 */
function readThreadModelSpec(metadata: unknown): string {
  if (typeof metadata !== 'object' || metadata === null) return '';

  return asText((metadata as Record<string, unknown>).model_spec);
}

/** 智能体配置里的默认模型。 */
function readAgentModel(agentConfig: unknown): string {
  if (typeof agentConfig !== 'object' || agentConfig === null) return '';

  return asText((agentConfig as Record<string, unknown>).model);
}

/** 四级回退；都取不到时返回空串，调用方按「没有显式选择」处理。 */
export function resolveModelSpec(input: {
  override?: unknown;
  threadMetadata?: unknown;
  agentConfig?: unknown;
  systemDefault?: unknown;
}): string {
  return (
    asText(input.override) ||
    readThreadModelSpec(input.threadMetadata) ||
    readAgentModel(input.agentConfig) ||
    asText(input.systemDefault)
  );
}

/**
 * 触发按钮上的文本；与参照 `displayName: 'mini'` 同值：取 `provider:model` 里模型名的最后一段。
 *
 * 悬浮说明用的是完整 spec，因此这里可以只显示短名。
 */
export function formatModelSpecLabel(spec: unknown, placeholder: string): string {
  const text = asText(spec);
  if (!text) return placeholder;

  const separator = text.indexOf(':');
  const modelName = separator >= 0 ? text.slice(separator + 1) : text;

  return modelName.split('/').pop() || modelName || text;
}

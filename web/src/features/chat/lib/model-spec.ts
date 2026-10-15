/** 当前模型的回退链。 */

/** 草稿态（还没有会话）的覆盖键。 */
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

/** 触发按钮上的文本：取 `provider:model` 里模型名的最后一段。 */
export function formatModelSpecLabel(
  spec: unknown,
  placeholder: string,
): string {
  const text = asText(spec);
  if (!text) return placeholder;

  const separator = text.indexOf(':');
  const modelName = separator >= 0 ? text.slice(separator + 1) : text;

  return modelName.split('/').pop() || modelName || text;
}

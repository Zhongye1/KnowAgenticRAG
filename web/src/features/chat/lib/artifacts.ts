/**
 * 产物提取与展示归一。
 *
 * `present_artifacts` 是有意不展示的工具调用（`HIDDEN_TOOL_CALL_IDS`），
 * 交付物改由对话流里的产物卡片呈现；提取规则对齐参照的
 * `MessageProcessor.extractArtifactsFromConversation`。
 */
import type { Conversation } from './message-processor';

/** 卡片展示用的一条产物：去重后的路径与文件名。 */
export type ArtifactItem = {
  path: string;
  name: string;
};

const isSuccessfulToolCall = (
  toolCall: {
    tool_call_result?: { content?: unknown } | null;
    status?: string;
  } | null,
): boolean =>
  Boolean(toolCall?.tool_call_result) || toolCall?.status === 'success';

/**
 * 从一轮对话提取已成功登记的交付物路径。
 *
 * 只认 AI 消息的 `present_artifacts` 调用；结果为空且状态非 success 的调用不算交付，
 * 路径去重并保持首次出现顺序。
 */
export function extractArtifactsFromConversation(
  conversation: Conversation | null | undefined,
): string[] {
  if (!conversation || !Array.isArray(conversation.messages)) return [];

  const artifacts: string[] = [];
  const seenPaths = new Set<string>();
  for (const message of conversation.messages) {
    if (message?.type !== 'ai' || !Array.isArray(message.tool_calls)) continue;

    for (const toolCall of message.tool_calls) {
      const toolName = toolCall?.name || toolCall?.function?.name;
      if (toolName !== 'present_artifacts') continue;
      if (!isSuccessfulToolCall(toolCall)) continue;

      let args = toolCall.args ?? toolCall.function?.arguments;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          continue;
        }
      }

      const filepaths = Array.isArray((args as { filepaths?: unknown })?.filepaths)
        ? (args as { filepaths: unknown[] }).filepaths
        : [];
      for (const filepath of filepaths) {
        const normalizedPath = typeof filepath === 'string' ? filepath.trim() : '';
        if (!normalizedPath || seenPaths.has(normalizedPath)) continue;
        seenPaths.add(normalizedPath);
        artifacts.push(normalizedPath);
      }
    }
  }
  return artifacts;
}

/** 归一卡片条目；丢弃非字符串与空白路径。 */
export function normalizeArtifactItems(paths: unknown): ArtifactItem[] {
  if (!Array.isArray(paths)) return [];
  const items: ArtifactItem[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    if (typeof raw !== 'string') continue;
    const path = raw.trim();
    const name = path.split('/').filter(Boolean).pop() || '';
    // 连文件名都取不出的路径（如 `/`）不渲染
    if (!path || !name || seen.has(path)) continue;
    seen.add(path);
    items.push({ path, name });
  }
  return items;
}

const EXTENSION_LABELS: Record<string, string> = {
  md: 'Markdown 文档',
  txt: '文本文件',
  csv: 'CSV 表格',
  json: 'JSON 文件',
};

/** 卡片上的类型描述；识别不出扩展名时是「交付文件」。 */
export function artifactMetaLabel(path: string): string {
  const filename = path.split('/').filter(Boolean).pop() || '';
  if (!filename.includes('.')) return '交付文件';
  const extension = filename.split('.').pop() || '';
  return (
    EXTENSION_LABELS[extension.toLowerCase()] ??
    (extension ? `交付文件 · ${extension.toUpperCase()}` : '交付文件')
  );
}

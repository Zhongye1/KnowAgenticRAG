/**
 * 知识导图的纯逻辑：JSON 树 → Markdown、空态与增量入口的判定。
 *
 * 移植上游 `MindMapSection.vue` 的 `jsonToMarkdown` 与两处 computed：markmap 吃 Markdown，
 * 后端给的是 `{content, children}` 树，层级决定标题级别。
 */
import type { MindmapDiff, MindmapNode } from '../api/mindmap-api';

/** 树 → Markdown：每层一个 `#`，节点之间留空行（markmap 的解析口径）。 */
export const mindmapToMarkdown = (node?: MindmapNode | null): string => {
  if (!node || typeof node.content !== 'string' || node.content === '')
    return '';

  const walk = (current: MindmapNode, level: number): string => {
    const heading = `${'#'.repeat(level + 1)} ${current.content}\n\n`;
    const children = current.children ?? [];
    return heading + children.map((child) => walk(child, level + 1)).join('');
  };

  return walk(node, 0);
};

/** 有没有可展示的导图（后端用 `mindmap: null` 表示还没生成）。 */
export const hasMindmap = (mindmap?: MindmapNode | null): boolean =>
  Boolean(mindmap && typeof mindmap.content === 'string' && mindmap.content);

/** 增量更新入口：只有差异检测说需要更新时才出现（上游 `isIncremental`）。 */
export const canIncrementalUpdate = (diff?: MindmapDiff | null): boolean =>
  Boolean(diff?.needs_update);

/** 增量按钮上的角标：新增文件数；没有差异时不显示。 */
export const mindmapAddedCount = (diff?: MindmapDiff | null): number =>
  diff?.added_files?.length ?? 0;

/** 差异摘要，给提示语用；没有差异时返回 null。 */
export const summarizeMindmapDiff = (
  diff?: MindmapDiff | null,
): string | null => {
  if (!diff?.needs_update) return null;
  const added = diff.added_files?.length ?? 0;
  const removed = diff.removed_file_ids?.length ?? 0;
  const parts: string[] = [];
  if (added > 0) parts.push(`新增 ${added} 个文件`);
  if (removed > 0) parts.push(`移除 ${removed} 个文件`);
  return parts.length > 0 ? parts.join('，') : null;
};

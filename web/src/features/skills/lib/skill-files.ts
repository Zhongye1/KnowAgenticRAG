/**
 * 技能文件树与预览的纯规则。
 *
 * 技能目录里只有文本文件（后端 `read_skill_file` 拒绝非文本），因此预览按扩展名
 * 决定是否走 Markdown 渲染，其余文件用等宽文本框展示。
 */
import type { SkillFileNode } from '../api/skill-api';

/** 详情页默认打开的文件（技能说明，后端约定它在根目录）。 */
export const SKILL_MD = 'SKILL.md';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];

export const isMarkdownPath = (path: string): boolean => {
  const lower = path.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension));
};

/** 按路径找节点（展开态与父级高亮用）。 */
export const findNode = (
  nodes: SkillFileNode[],
  path: string,
): SkillFileNode | null => {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findNode(node.children ?? [], path);
    if (found) return found;
  }
  return null;
};

/** 收集所有目录路径；渲染缩进列表时用它判断哪些节点可以展开。 */
export const collectDirectoryPaths = (nodes: SkillFileNode[]): string[] =>
  nodes.flatMap((node) =>
    node.is_dir
      ? [node.path, ...collectDirectoryPaths(node.children ?? [])]
      : [],
  );

/**
 * 选中文件后打开它的祖先目录，否则文件在折叠的目录里看不见。
 */
export const ancestorPaths = (path: string): string[] => {
  const parts = path.split('/');
  return parts
    .slice(0, -1)
    .map((_, index) => parts.slice(0, index + 1).join('/'));
};

/** 目录树刷新后，新树的合法路径集合（用于丢弃已经消失的展开项）。 */
export const treePaths = (nodes: SkillFileNode[]): string[] =>
  nodes.flatMap((node) => [node.path, ...treePaths(node.children ?? [])]);

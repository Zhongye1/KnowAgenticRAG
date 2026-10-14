/**
 * 个人空间页面的取值与判定。
 *
 * 对齐参照 `WorkspaceSidebar.vue` 与 `WorkspaceFileList.vue`：面包屑第一段固定是「全部文件」，
 * 侧栏的快速访问是 `/agents/` 与 `/saved_artifacts` 两处，行菜单只有下载与删除（目录不下载）。
 */
import type { FileEntry } from '@/shared/lib/filesystem-entry';
import {
  isSameOrChildPath,
  pathBreadcrumbs,
} from '@/shared/lib/workspace-path';

import {
  formatFileSize,
  formatRelativeTime,
  isEditableWorkspaceFile,
} from './file-format';

/** 面包屑第一段的名字；与参照同值。 */
export const WORKSPACE_ROOT_LABEL = '全部文件';

/**
 * 快速访问。
 *
 * `/agents/` 是智能体文件目录（`AGENTS.md` / `USER.md` / `MEMORY.md` 会被注入到提示词），
 * `/saved_artifacts` 是产物保存的默认落点；两个路径都是后端约定，不是前端拼出来的。
 */
export const QUICK_ACCESS = [
  { key: 'agents', label: '智能体文件', path: '/agents/' },
  { key: 'artifacts', label: '保存的产物', path: '/saved_artifacts' },
] as const;

export type QuickAccessItem = (typeof QUICK_ACCESS)[number];

/** 面包屑：根固定为「全部文件」，后面按路径逐段。 */
export const workspaceBreadcrumbs = (
  path: string,
): Array<{ name: string; path: string }> => [
  { name: WORKSPACE_ROOT_LABEL, path: '/' },
  ...pathBreadcrumbs(path),
];

/**
 * 当前路径算不算落在一个快速访问入口下。
 *
 * 参照用它把「个人空间」根项的高亮让给快速访问项：在 `/agents/…` 里时根项不再高亮。
 * 注意参照对快速访问项本身用的是**严格同层**判定（`isSamePath`），所以进入
 * `/agents/skills/` 时没有任何一项高亮——这是参照的行为，不是遗漏。
 */
export const isQuickAccessPath = (path: string): boolean =>
  QUICK_ACCESS.some((item) => isSameOrChildPath(path, item.path));

/** 是不是个人空间的根。 */
export const isWorkspaceRoot = (path: string): boolean =>
  String(path ?? '').replace(/\/+$/, '') === '';

export type WorkspaceRow = {
  /** 表格行键：接口给的原始路径（目录带尾斜杠）。 */
  key: string;
  entry: FileEntry;
  name: string;
  sizeLabel: string;
  modifiedLabel: string;
  isDir: boolean;
  /** 目录不能下载；文件可以。 */
  canDownload: boolean;
  /** 可编辑的文件（`.md/.markdown/.mdx/.txt`）才给编辑入口。 */
  editable: boolean;
};

/** 行视图：表格只消费这一层，格式化规则因此可以脱离渲染被测。 */
export const buildWorkspaceRows = (
  entries: FileEntry[],
  now: number = Date.now(),
): WorkspaceRow[] =>
  entries.map((entry) => ({
    key: entry.path,
    entry,
    name: entry.name || entry.path,
    sizeLabel: formatFileSize(entry.size, entry.isDir),
    modifiedLabel: formatRelativeTime(entry.modifiedAt, now),
    isDir: entry.isDir,
    canDownload: !entry.isDir,
    editable: !entry.isDir && isEditableWorkspaceFile(entry.path),
  }));

/**
 * 换目录后修剪选中集。
 *
 * 只保留仍在这一层里的路径：多选态跨目录保留会让「删除选中」删掉用户已经看不见的条目。
 */
export const pruneSelection = (
  selectedPaths: string[],
  entries: FileEntry[],
): string[] => {
  const available = new Set(entries.map((entry) => entry.path));

  return selectedPaths.filter((path) => available.has(path));
};

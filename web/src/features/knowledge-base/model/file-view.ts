/**
 * 文件表的视图状态，以及搜索命中项的定位规则。
 *
 * 位置与状态筛选一起变更、由页面持有（搜索命中也要改它们），所以放在 model 段而不是 ui 段。
 */
import type { KnowledgeFileSearchItem } from '../api/knowledge-api';
import { splitFilename } from '../lib/knowledge-files';

/**
 * 面包屑的一节；点击回到该层。
 *
 * 每一节自带定位信息：虚拟目录没有实体记录，只能靠它记录的 `pathPrefix` 还原。
 */
export type FileCrumb = {
  fileId: string | null;
  pathPrefix: string;
  filename: string;
};

/**
 * 目录位置。虚拟目录没有实体 file_id：用它的父目录 id + `pathPrefix` 定位。
 */
export type FileLocation = {
  parentId: string | null;
  pathPrefix: string;
  crumbs: FileCrumb[];
};

/**
 * 文件表的视图状态：目录位置、状态筛选与页码。
 *
 * 页码也由页面持有：页面能改位置（搜索命中跳目录），表格若自己存页码就会带着
 * 上一层的第 2 页去查新目录。位置变更一律走 `openLocation`，一次把三者归位。
 */
export type FileView = { location: FileLocation; status: string; page: number };

/** 打开一个位置：状态筛选归位到全部、回到第一页。 */
export const openLocation = (location: FileLocation): FileView => ({
  location,
  status: 'all',
  page: 1,
});

/** 实体目录名拿不到时的面包屑占位（搜索接口只返回父目录 id，没有目录名）。 */
export const UNKNOWN_DIR_CRUMB = '…';

/**
 * 把搜索命中项转成文件表的位置。
 *
 * 搜索接口只回 `parent_id` 和完整相对路径，没有目录名、也没有 `path_prefix`。
 * 两者是独立字段（后端 `filename` 存相对路径、`parent_id` 存实体父目录），
 * 也就是说路径投影的文件同样可以挂在实体目录下，因此 `parent_id` 必须保留：
 * - 目录部分逐段做成面包屑（每节 `fileId` 用真实父目录 id，点击就是该父目录下的一层）；
 * - 实体目录名接口给不出，`parent_id` 非空时在最前面补一节 `…` 占位，等 S3.4 的文件详情补名称；
 * - 没有目录部分又只有 `parent_id` 时，只剩那一节占位；两者都没有就是根目录。
 *
 * 能定位到目录就先定位；打开文件详情属于文件详情分片。
 */
export const buildSearchHitLocation = (
  file: Pick<KnowledgeFileSearchItem, 'filename' | 'parent_id'>,
): FileLocation => {
  const parentId = file.parent_id ?? null;
  const parentCrumb: FileCrumb[] = parentId
    ? [{ fileId: parentId, pathPrefix: '', filename: UNKNOWN_DIR_CRUMB }]
    : [];

  const { dirname } = splitFilename(file.filename);
  if (!dirname) {
    return { parentId, pathPrefix: '', crumbs: parentCrumb };
  }

  // 只有分隔符的名字（`//`）会拆出空目录，按父目录本身处理，不去访问不存在的一节
  const segments = dirname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return { parentId, pathPrefix: '', crumbs: parentCrumb };
  }
  const crumbs: FileCrumb[] = [
    ...parentCrumb,
    ...segments.map((segment, index) => ({
      fileId: parentId,
      pathPrefix: `${segments.slice(0, index + 1).join('/')}/`,
      filename: segment,
    })),
  ];
  const last = crumbs[crumbs.length - 1];
  return { parentId, pathPrefix: last.pathPrefix, crumbs };
};

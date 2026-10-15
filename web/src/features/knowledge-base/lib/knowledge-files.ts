/**
 * 知识库文件的状态词表、展示规则与能力矩阵。
 *
 * 状态标签与色调、筛选选项、排序权重，
 * 以及解析/入库/重新入库/下载/删除/多选/预览的能力判定（`FileTable.vue` 的行操作与批量条
 * 按它决定哪些入口可用，文件详情弹窗按预览档位决定初始视图）。
 *
 * 时间与内容量的格式也集中在这里，便于脱离组件测时区与进制。
 */
import { parseShanghai } from './knowledge-view';

/** 后端状态 → 界面标签与色调；未知状态原样显示标签。 */
const STATUS_VIEW: Record<string, { label: string; tone: string }> = {
  uploaded: { label: '待解析', tone: 'warning' },
  parsing: { label: '解析中', tone: 'info' },
  parsed: { label: '待入库', tone: 'primary' },
  error_parsing: { label: '重试解析', tone: 'error' },
  indexing: { label: '入库中', tone: 'info' },
  indexed: { label: '已入库', tone: 'success' },
  error_indexing: { label: '重试入库', tone: 'error' },
  done: { label: '已入库', tone: 'success' },
  failed: { label: '入库失败', tone: 'error' },
  processing: { label: '处理中', tone: 'info' },
  waiting: { label: '等待中', tone: 'warning' },
};

/** antd `Tag` 的状态色；未知状态走 `default`。 */
export type FileStatusColor =
  'warning' | 'processing' | 'cyan' | 'success' | 'error' | 'default';

/** 色调 → antd `Tag` 的状态色。 */
const TONE_COLORS: Record<string, FileStatusColor> = {
  warning: 'warning',
  info: 'processing',
  primary: 'cyan',
  success: 'success',
  error: 'error',
};

export type FileStatusView = {
  label: string;
  tone: string;
  color: FileStatusColor;
};

export const getFileStatusView = (status?: string | null): FileStatusView => {
  const view = STATUS_VIEW[status ?? ''] ?? {
    label: status || '未知',
    tone: 'neutral',
  };
  return {
    ...view,
    color: TONE_COLORS[view.tone] ?? 'default',
  };
};

/** 状态筛选选项，共 7 项。 */
export const FILE_STATUS_FILTER_OPTIONS = [
  { label: '待解析', value: 'uploaded' },
  { label: '解析中', value: 'parsing' },
  { label: '待入库', value: 'parsed' },
  { label: '重试解析', value: 'error_parsing' },
  { label: '入库中', value: 'indexing' },
  { label: '已入库', value: 'indexed' },
  { label: '重试入库', value: 'error_indexing' },
] as const;

/** 排序权重：已入库 → 处理中 → 待处理 → 失败。 */
const STATUS_SORT_ORDER: Record<string, number> = {
  done: 1,
  indexed: 1,
  processing: 2,
  indexing: 2,
  parsing: 2,
  waiting: 3,
  uploaded: 3,
  parsed: 3,
  failed: 4,
  error_indexing: 4,
  error_parsing: 4,
};

export const getFileStatusSortWeight = (status?: string | null): number =>
  STATUS_SORT_ORDER[status ?? ''] ?? 99;

/** 处理中：用于「处理中」提示与轮询判定。 */
const PROCESSING_STATUSES = new Set([
  'processing',
  'waiting',
  'parsing',
  'indexing',
]);

/** 不能勾选的状态。 */
const TABLE_SELECTION_BLOCKED_STATUSES = new Set(['processing', 'waiting']);

/** 不能删除的状态：解析与入库进行中也不行。 */
const DELETE_BLOCKED_STATUSES = new Set(['processing', 'parsing', 'indexing']);

/** 可以提交解析的状态。 */
const PARSEABLE_STATUSES = new Set(['uploaded', 'error_parsing']);

/** 可以提交入库的状态。 */
const INDEXABLE_STATUSES = new Set([
  'parsed',
  'error_indexing',
  'done',
  'indexed',
]);

/** 可以重新入库的状态。 */
const REINDEXABLE_STATUSES = new Set(['done', 'indexed']);

/** 有解析结果可看的预览状态。 */
const PARSED_PREVIEW_STATUSES = new Set([
  'done',
  'parsed',
  'indexed',
  'error_indexing',
]);

/** 只有源文件可看的预览状态。 */
const SOURCE_ONLY_PREVIEW_STATUSES = new Set(['uploaded', 'error_parsing']);

/** 能看分块的状态。 */
const CHUNK_PREVIEW_STATUSES = new Set(['done', 'indexed']);

/** 有原始文件可下载的状态。 */
const DOWNLOADABLE_STATUSES = new Set([
  'done',
  'indexed',
  'parsed',
  'error_indexing',
]);

/** 能力判定只看这几个字段：表格行与批量条都拿得出来。 */
export type FileCapabilityTarget = {
  is_folder: boolean;
  status: string | null;
  file_type?: string | null;
  /** 后端算出来的「有原始文件 / 有解析结果」；缺省时按状态兜底。 */
  has_original_file?: boolean;
  has_parsed_markdown?: boolean;
};

/** 行内操作的两类动作。 */
export const FILE_ACTIONS = {
  PARSE: 'parse',
  INDEX: 'index',
} as const;

export type FileActionType = (typeof FILE_ACTIONS)[keyof typeof FILE_ACTIONS];

export type FilePrimaryAction = { type: FileActionType; label: string };

/** 状态 → 该状态下唯一的主操作。 */
const STATUS_ACTION: Record<string, FilePrimaryAction> = {
  uploaded: { type: FILE_ACTIONS.PARSE, label: '解析文件' },
  error_parsing: { type: FILE_ACTIONS.PARSE, label: '重试解析' },
  parsed: { type: FILE_ACTIONS.INDEX, label: '入库' },
  error_indexing: { type: FILE_ACTIONS.INDEX, label: '重试入库' },
};

const targetsFile = (file?: FileCapabilityTarget | null): boolean =>
  Boolean(file && !file.is_folder);

/** 主操作：解析或入库；目录与已入库的行没有。 */
export const getFilePrimaryAction = (
  file?: FileCapabilityTarget | null,
): FilePrimaryAction | null => {
  if (!targetsFile(file)) return null;
  return STATUS_ACTION[file?.status ?? ''] ?? null;
};

export const canParseFile = (file?: FileCapabilityTarget | null): boolean =>
  targetsFile(file) && PARSEABLE_STATUSES.has(file?.status ?? '');

export const canIndexFile = (file?: FileCapabilityTarget | null): boolean =>
  targetsFile(file) && INDEXABLE_STATUSES.has(file?.status ?? '');

export const canReindexFile = (file?: FileCapabilityTarget | null): boolean =>
  targetsFile(file) && REINDEXABLE_STATUSES.has(file?.status ?? '');

/** 下载要排除 URL 类型：它只有链接，后端也会拒绝。 */
export const canDownloadFile = (file?: FileCapabilityTarget | null): boolean =>
  targetsFile(file) &&
  file?.file_type !== 'url' &&
  DOWNLOADABLE_STATUSES.has(file?.status ?? '');

export const isProcessingFile = (file?: FileCapabilityTarget | null): boolean =>
  Boolean(file && PROCESSING_STATUSES.has(file.status ?? ''));

/**
 * 能否勾选：处理中的行不进批量。
 * `locked` 表示有操作在飞行中。
 */
export const canSelectFile = (
  file?: FileCapabilityTarget | null,
  locked = false,
): boolean =>
  targetsFile(file) &&
  !locked &&
  !TABLE_SELECTION_BLOCKED_STATUSES.has(file?.status ?? '');

/**
 * 能否删除：比可勾选多挡住 `parsing` 与 `indexing`。
 * 批量删除按本函数过滤：解析与入库中的文件不提交删除。
 */
export const canDeleteFile = (
  file?: FileCapabilityTarget | null,
  locked = false,
): boolean =>
  targetsFile(file) &&
  !locked &&
  !DELETE_BLOCKED_STATUSES.has(file?.status ?? '');

/** 详情弹窗的三种视图；可见性由下面的预览判定决定。 */
export type FileDetailView = 'source' | 'markdown' | 'chunks';

/**
 * 能否看解析后的 Markdown。
 *
 * 行上有 `has_parsed_markdown` 就以它为准（那是后端按 MinIO 对象算出来的事实），
 * 只有列不出来源的记录（例如搜索结果）才按状态兜底。
 */
export const canPreviewParsed = (
  file?: FileCapabilityTarget | null,
): boolean => {
  if (!targetsFile(file)) return false;
  if (file?.has_parsed_markdown !== undefined) {
    return Boolean(file.has_parsed_markdown);
  }
  return PARSED_PREVIEW_STATUSES.has(file?.status ?? '');
};

/** 能否看源文件：URL 类型没有原始文件。 */
export const canPreviewOriginal = (
  file?: FileCapabilityTarget | null,
): boolean => {
  if (!targetsFile(file) || file?.file_type === 'url') return false;
  if (file?.has_original_file !== undefined) {
    return Boolean(file.has_original_file);
  }
  return true;
};

/** 能否看分块：只有确实入过库的行有。 */
export const canPreviewChunks = (file?: FileCapabilityTarget | null): boolean =>
  targetsFile(file) && CHUNK_PREVIEW_STATUSES.has(file?.status ?? '');

/** 能否打开详情弹窗：有解析结果，或只有源文件可看。 */
export const canOpenFileDetail = (
  file?: FileCapabilityTarget | null,
): boolean =>
  canPreviewParsed(file) ||
  (SOURCE_ONLY_PREVIEW_STATUSES.has(file?.status ?? '') &&
    canPreviewOriginal(file));

/** 初始视图：只有源文件时看源文件，否则看解析结果。 */
export const getDefaultDetailView = (
  file?: FileCapabilityTarget | null,
): FileDetailView =>
  !canPreviewParsed(file) && canPreviewOriginal(file) ? 'source' : 'markdown';

/** 分页每页条数：与后端允许的上限一致。 */
export const FILE_PAGE_SIZE_OPTIONS = [100, 300, 500] as const;

/**
 * 下载响应里的文件名。
 *
 * 后端对非 ASCII 名走 RFC 5987（`attachment; filename*=UTF-8''%E5%B9%B4...`），
 * 纯 ASCII 名走 `filename="..."`；两者都解析不出就返回 `null`，界面用行上的文件名兜底。
 */
export const parseDownloadFilename = (
  contentDisposition?: string | null,
): string | null => {
  if (!contentDisposition) return null;
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      return null;
    }
  }
  const quoted = contentDisposition.match(/filename="?([^";]+)"?/i);
  if (!quoted?.[1]) return null;
  const name = quoted[1].trim();
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

const pad2 = (value: number) => String(value).padStart(2, '0');

/**
 * 文件表的「时间」列：一年内 `MM月DD日 HH:mm:ss`，
 * 更早只到日。按上海墙上时间退一年。
 */
export const formatFileTableTime = (value?: string | null): string => {
  const shanghai = parseShanghai(value);
  if (!shanghai) return '-';
  const now = parseShanghai(new Date().toISOString());
  if (!now) return '-';
  const lastYear = now.getUTCFullYear() - 1;
  const lastYearMonth = now.getUTCMonth();
  // 2 月 29 日退一年要收敛到 2 月 28 日，直接 Date.UTC 会溢出到 3 月 1 日
  const lastYearDays = new Date(
    Date.UTC(lastYear, lastYearMonth + 1, 0),
  ).getUTCDate();
  const oneYearAgo = Date.UTC(
    lastYear,
    lastYearMonth,
    Math.min(now.getUTCDate(), lastYearDays),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
  );
  const month = pad2(shanghai.getUTCMonth() + 1);
  const day = pad2(shanghai.getUTCDate());
  // 正好落在一年前那个毫秒算更早
  if (shanghai.getTime() > oneYearAgo) {
    return `${month}月${day}日 ${pad2(shanghai.getUTCHours())}:${pad2(shanghai.getUTCMinutes())}:${pad2(shanghai.getUTCSeconds())}`;
  }
  return `${shanghai.getUTCFullYear()}年${month}月${day}日`;
};

/** 搜索结果里的时间：当年 `M月D日 HH:mm`，跨年补年份；无效值留空。 */
export const formatSearchResultTime = (value?: string | null): string => {
  const shanghai = parseShanghai(value);
  if (!shanghai) return '';
  const now = parseShanghai(new Date().toISOString());
  const month = shanghai.getUTCMonth() + 1;
  const day = shanghai.getUTCDate();
  const time = `${pad2(shanghai.getUTCHours())}:${pad2(shanghai.getUTCMinutes())}`;
  if (now && shanghai.getUTCFullYear() === now.getUTCFullYear()) {
    return `${month}月${day}日 ${time}`;
  }
  return `${shanghai.getUTCFullYear()}-${pad2(month)}-${pad2(day)} ${time}`;
};

/** 内容量：k/m 进制，不足千位按本地化千分位。 */
export const formatContentCount = (value?: number | null): string => {
  const number = Number(value ?? 0);
  const absValue = Math.abs(number);
  if (absValue >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}m`;
  if (absValue >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return number.toLocaleString('zh-CN');
};

/** 搜索命中项的路径：`brief/a.md` → `{basename:'a.md', dirname:'brief'}`。 */
export const splitFilename = (
  filename?: string | null,
): { basename: string; dirname: string } => {
  const name = filename ?? '';
  const index = name.lastIndexOf('/');
  if (index < 0) return { basename: name, dirname: '' };
  return { basename: name.slice(index + 1), dirname: name.slice(0, index) };
};

/** 过长的目录前缀只留尾部。 */
const PATH_PREVIEW_LIMIT = 48;

export const formatDirname = (dirname?: string | null): string => {
  const dir = dirname ?? '';
  if (!dir) return '';
  if (dir.length <= PATH_PREVIEW_LIMIT) return dir;
  return `...${dir.slice(dir.length - PATH_PREVIEW_LIMIT + 3)}`;
};

/** 拖拽移动的能力判定。 */

/** 拖拽判定要的行字段。 */
export type DraggableFileTarget = {
  file_id: string;
  is_folder: boolean;
  is_virtual_folder?: boolean;
};

/** 拖拽判定要的面包屑字段；`file_id === null` 表示虚拟层（路径投影）。 */
export type DroppableCrumb = { fileId: string | null };

/** 文件区整体可变更？跨目录筛选与虚拟层里「移动」没有确定语义，一并关掉。 */
export const canMutateKnowledgeFiles = ({
  readOnly,
  locked,
  filtered,
  virtualPath,
}: {
  readOnly: boolean;
  locked: boolean;
  filtered: boolean;
  virtualPath: boolean;
}): boolean => !readOnly && !locked && !filtered && !virtualPath;

/** 这一行可拖？虚拟目录不可拖，且要存在至少一个可落点。 */
export const canDragKnowledgeFile = ({
  enabled,
  file,
  crumbs,
  files,
}: {
  enabled: boolean;
  file?: DraggableFileTarget | null;
  crumbs: readonly DroppableCrumb[];
  files: readonly DraggableFileTarget[];
}): boolean =>
  Boolean(
    enabled &&
    file &&
    !file.is_virtual_folder &&
    (crumbs.length > 0 ||
      files.some(
        (item) =>
          item.is_folder &&
          !item.is_virtual_folder &&
          item.file_id !== file.file_id,
      )),
  );

/** 这个文件夹能作为落点？虚拟目录与自身都不是。 */
export const canDropKnowledgeFileIntoFolder = (
  file: DraggableFileTarget | null,
  target?: DraggableFileTarget | null,
): boolean =>
  Boolean(
    file &&
    target?.is_folder &&
    !target.is_virtual_folder &&
    target.file_id !== file.file_id,
  );

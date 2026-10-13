/**
 * 用户消息附件的展示归一。
 *
 * 事实源是后端 `serialize_attachment` 的输出（`file_id` / `file_name` / `file_type` /
 * `file_size` / `artifact_url` / `original_artifact_url` / `path`）。文案格式与参照实现
 * 的 `file_utils.js` 同口径：大小用「两位小数后去掉尾零」，未知显示 `-`；
 * 类型优先取扩展名，其次取 MIME 子类型，都没有时显示「文件」。
 *
 * 不复用知识库的 `formatBytes`：它是固定一位小数、未知显示 `—`，与参照不是一套格式。
 */

/** 后端附件记录的字段；只声明展示需要的那些。 */
export type AttachmentRecord = {
  file_id?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  path?: string | null;
  artifact_url?: string | null;
  original_artifact_url?: string | null;
};

export type AttachmentPreview = {
  /** 归一后的稳定标识：`file_id` 优先，其次路径，再次文件名。 */
  fileId: string;
  name: string;
  /** 预览地址；没有时为空串。 */
  previewUrl: string;
  /** 「类型 · 大小」，两者都没有时为空串。 */
  meta: string;
};

/** 取路径或文件名里的最后一段；空值落到 `fallback`。 */
export function getDisplayFileName(
  pathOrName: string | null | undefined,
  fallback = '附件',
): string {
  const value = String(pathOrName ?? '').trim();
  if (!value) return fallback;

  return value.split('/').pop() || value || fallback;
}

/** 小写扩展名；没有扩展名返回空串。 */
function fileExtensionOf(pathOrName: string | null | undefined): string {
  const normalized = String(pathOrName ?? '')
    .trim()
    .toLowerCase();
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex <= 0) return '';

  return normalized.slice(dotIndex);
}

/** 扩展名标签：`.pdf` → `PDF`；没有扩展名返回空串。 */
export function getFileExtensionLabel(
  pathOrName: string | null | undefined,
): string {
  const extension = fileExtensionOf(pathOrName).replace(/^\./, '');

  return extension ? extension.toUpperCase() : '';
}

/** MIME 子类型标签：`application/pdf` → `PDF`；空值返回空串。 */
export function getMimeSubtypeLabel(
  mimeType: string | null | undefined,
): string {
  const subtype = String(mimeType ?? '')
    .split('/')
    .pop()
    ?.trim();

  return subtype ? subtype.toUpperCase() : '';
}

/**
 * 附件大小：1024 进制，两位小数后去掉尾零（`2048` → `2 KB`）。
 * `0` 显示 `0 B`，空值与非数字显示 `-`。
 */
export function formatAttachmentSize(
  bytes: number | string | null | undefined,
): string {
  if (bytes === 0 || bytes === '0') return '0 B';
  if (bytes === null || bytes === undefined || bytes === '') return '-';

  const value = Number(bytes);
  if (!Number.isFinite(value)) return '-';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const scaled = Number((value / 1024 ** unitIndex).toFixed(2));

  return `${scaled} ${units[unitIndex]}`;
}

/** 把一条后端附件记录归一成展示用形状；没有可用标识的条目被丢掉。 */
export function normalizeAttachmentPreview(
  attachment: AttachmentRecord | null | undefined,
): AttachmentPreview | null {
  const name = getDisplayFileName(
    attachment?.file_name || attachment?.path,
    '附件',
  );
  // 标识只认后端给的字段：兜底名不算标识，否则一条空记录也会被当成名为「附件」的附件
  const fileId =
    attachment?.file_id || attachment?.path || attachment?.file_name || '';
  if (!fileId) return null;

  const typeLabel =
    getFileExtensionLabel(name) ||
    getMimeSubtypeLabel(attachment?.file_type) ||
    '文件';
  const sizeLabel = formatAttachmentSize(attachment?.file_size);
  const meta = [typeLabel, sizeLabel === '-' ? '' : sizeLabel]
    .filter(Boolean)
    .join(' · ');

  return {
    fileId,
    name,
    previewUrl:
      attachment?.original_artifact_url || attachment?.artifact_url || '',
    meta,
  };
}

/** 批量归一；非数组与缺标识的条目都按「没有附件」处理。 */
export function normalizeAttachmentPreviews(
  attachments: unknown,
): AttachmentPreview[] {
  if (!Array.isArray(attachments)) return [];

  return attachments
    .map((item) => normalizeAttachmentPreview(item as AttachmentRecord))
    .filter((item): item is AttachmentPreview => item !== null);
}

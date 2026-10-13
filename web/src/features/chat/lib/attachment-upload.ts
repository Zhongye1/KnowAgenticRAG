/**
 * 附件上传的纯逻辑。
 *
 * 对齐参照的 `AttachmentTmpUploadModal.vue`：三步是「上传到临时区 → 可选解析 → 确认到会话」，
 * 条目的可用状态是「已上传」与「已解析」，有任一条在上传或解析中时不能确认。
 *
 * 上限与后端同值（`MAX_ATTACHMENT_SIZE_BYTES`）：本地先拦一次只是不让用户白等一次上传，最终
 * 判定仍在后端。格式不在这里校验——参照的提示是「支持任意文件格式」，允许哪些扩展名由后端决定。
 */

/** 单文件上限；与后端 `MAX_ATTACHMENT_SIZE_BYTES` 同值。 */
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

/** 配置里没写默认 OCR 引擎时的回退值；与参照同值。 */
export const DEFAULT_OCR_ENGINE = 'rapid_ocr';

export type AttachmentStatus =
  | 'uploading'
  | 'uploaded'
  | 'parsing'
  | 'parsed'
  | 'error';

export type AttachmentItem = {
  /** 本地标识：同一个文件可以被选两次，文件名不能当键。 */
  localId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  /** 临时对象名；上传成功后才有。 */
  objectName: string;
  parseSupported: boolean;
  parseMethods: string[];
  selectedParseMethod: string | null;
  /** 解析结果的对象名；解析成功后才有。 */
  parsedObjectName: string | null;
  status: AttachmentStatus;
  error: string | null;
  parseError: string | null;
};

/** 上传或解析中的条目。 */
export const isBusyItem = (item: AttachmentItem): boolean =>
  item.status === 'uploading' || item.status === 'parsing';

/** 有任一条在上传或解析中。 */
export const hasBusyItems = (items: AttachmentItem[]): boolean =>
  items.some(isBusyItem);

/** 可以被确认到会话的条目。 */
export const confirmableItems = (items: AttachmentItem[]): AttachmentItem[] =>
  items.filter((item) => item.status === 'uploaded' || item.status === 'parsed');

/** 有在途条目或没有可确认条目时不能确认。 */
export const canConfirm = (items: AttachmentItem[]): boolean =>
  !hasBusyItems(items) && confirmableItems(items).length > 0;

/** 确认载荷：只带可确认的条目，解析过的带上解析结果对象名。 */
export const toConfirmPayload = (
  items: AttachmentItem[],
): Array<{ file_type: string; object_name: string; parsed_object_name: string | null }> =>
  confirmableItems(items).map((item) => ({
    file_type: item.fileType,
    object_name: item.objectName,
    parsed_object_name: item.parsedObjectName,
  }));

/** 单文件校验；通过时返回 `null`，否则返回给用户看的文案。 */
export function validateAttachmentFile(
  file: { name: string; size: number },
  maxSizeBytes: number = MAX_ATTACHMENT_SIZE_BYTES,
): string | null {
  if (file.size > maxSizeBytes) {
    return `附件过大，当前仅支持 ${Math.floor(maxSizeBytes / (1024 * 1024))} MB 以内的文件`;
  }

  return null;
}

/**
 * 解析方式的默认值；与参照同序。
 *
 * 1. 配置里写了 `disable` 且可选里有它 → `disable`；
 * 2. 配置值在可选项里 → 用它；
 * 3. 可选项里有 `rapid_ocr` → 用它；
 * 4. 否则取第一个可选项；都没有时返回 `null`（这一条不支持解析）。
 */
export function getDefaultParseMethod(
  parseMethods: unknown,
  configuredEngine: unknown,
): string | null {
  const methods = (Array.isArray(parseMethods) ? parseMethods : []).filter(
    (method): method is string => typeof method === 'string' && method.length > 0,
  );
  if (!methods.length) return null;

  const configured =
    typeof configuredEngine === 'string' && configuredEngine.trim()
      ? configuredEngine.trim()
      : DEFAULT_OCR_ENGINE;

  if (configured === 'disable' && methods.includes('disable')) return 'disable';

  const selectable = methods.filter((method) => method !== 'disable');
  if (selectable.includes(configured)) return configured;
  if (selectable.includes(DEFAULT_OCR_ENGINE)) return DEFAULT_OCR_ENGINE;

  return selectable[0] ?? null;
}

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const asSize = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** 临时上传响应的归一；字段按不可信数据处理。 */
export function normalizeTmpUpload(
  response: unknown,
  configuredEngine: unknown,
): Pick<
  AttachmentItem,
  | 'fileName'
  | 'fileType'
  | 'fileSize'
  | 'objectName'
  | 'parseSupported'
  | 'parseMethods'
  | 'selectedParseMethod'
> {
  const source =
    typeof response === 'object' && response !== null
      ? (response as Record<string, unknown>)
      : {};
  const parseMethods = (Array.isArray(source.parse_methods) ? source.parse_methods : []).filter(
    (method): method is string => typeof method === 'string' && method.length > 0,
  );

  return {
    fileName: asText(source.file_name),
    fileType: asText(source.file_type),
    fileSize: asSize(source.file_size),
    objectName: asText(source.object_name),
    parseSupported: source.parse_supported === true,
    parseMethods,
    selectedParseMethod: getDefaultParseMethod(parseMethods, configuredEngine),
  };
}

/** 会话里的一条已确认附件。 */
export type ThreadAttachment = {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: string;
  /** 被哪个请求用掉了；还没有被用掉的才该随下一次发送下发。 */
  requestId: string | null;
};

/**
 * 下一次发送该带上的附件 id。
 *
 * 附件是单次使用的：后端把它绑到请求上之后会记下 `request_id`，再绑一次会被拒。所以这里只取
 * 还没被用掉的那些。
 */
export const pendingAttachmentFileIds = (
  attachments: ThreadAttachment[],
): string[] =>
  attachments
    .filter((attachment) => !attachment.requestId)
    .map((attachment) => attachment.fileId)
    .filter(Boolean);

/** 附件上传的纯逻辑。 */

/** 单文件上限；与后端 `MAX_ATTACHMENT_SIZE_BYTES` 同值。 */
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

/** 配置里没写默认 OCR 引擎时的回退值。 */
export const DEFAULT_OCR_ENGINE = 'rapid_ocr';

export type AttachmentStatus =
  'uploading' | 'uploaded' | 'parsing' | 'parsed' | 'error';

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
  items.filter(
    (item) => item.status === 'uploaded' || item.status === 'parsed',
  );

/** 有在途条目或没有可确认条目时不能确认。 */
export const canConfirm = (items: AttachmentItem[]): boolean =>
  !hasBusyItems(items) && confirmableItems(items).length > 0;

/** 确认载荷：只带可确认的条目，解析过的带上解析结果对象名。 */
export const toConfirmPayload = (
  items: AttachmentItem[],
): Array<{
  file_type: string;
  object_name: string;
  parsed_object_name: string | null;
}> =>
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

/** 解析方式的默认值。 */
export function getDefaultParseMethod(
  parseMethods: unknown,
  configuredEngine: unknown,
): string | null {
  const methods = (Array.isArray(parseMethods) ? parseMethods : []).filter(
    (method): method is string =>
      typeof method === 'string' && method.length > 0,
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

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';
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
  const parseMethods = (
    Array.isArray(source.parse_methods) ? source.parse_methods : []
  ).filter(
    (method): method is string =>
      typeof method === 'string' && method.length > 0,
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
  pendingThreadAttachments(attachments)
    .map((attachment) => attachment.fileId)
    .filter(Boolean);

/** 文件大小的短标签；上传弹窗与输入区附件卡片共用同一份换算。 */
export const formatFileSize = (size: number): string =>
  size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;

/**
 * 还没被用掉的附件条目。
 *
 * 输入区的预览与随发送下发的 id 必须用同一条判据，否则会出现「预览显示了却没下发」或反过来。
 */
export const pendingThreadAttachments = (
  attachments: ThreadAttachment[],
): ThreadAttachment[] =>
  attachments.filter((attachment) => !attachment.requestId);

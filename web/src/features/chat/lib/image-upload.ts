/**
 * 聊天图片附件。
 *
 * 上游这条链路的前端只做两件事：上传前校验「是不是图片」与「有没有超过 10MB」，
 * 以及把服务端返回的裸 base64 贴上 `data:` 前缀渲染。压缩、缩放、EXIF 修正、
 * 缩略图都在服务端完成，前端不碰像素。
 */

/** 上传前的体积上限，与后端 `POST /api/chat/image/upload` 的校验一致。 */
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

/** 待发送的单张图片；上游只支持一张，新图直接覆盖旧图。 */
export type UploadedImage = {
  /** 裸 base64，不含 `data:` 前缀。 */
  imageContent: string;
  mimeType: string;
  /** 用户选中的原始文件名，只用于提示与测试断言。 */
  originalName: string;
};

/** 后端图片上传响应里前端消费得到的字段。 */
export type ChatImageUploadResponse = {
  success: boolean;
  image_content?: string | null;
  mime_type?: string | null;
  error?: string | null;
};

/** 校验待上传的文件；通过时返回 null，否则返回可直接展示的失败文案。 */
export const validateImageFile = (file: File): string | null => {
  if (!file.type || !file.type.startsWith('image/')) {
    return '只能上传图片文件';
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return '图片文件过大，请上传小于 10MB 的图片';
  }
  return null;
};

/**
 * 从粘贴板里取待上传的图片。
 *
 * 与上游同规则：先扫 `items` 里的图片文件，没有再在 `files` 里找第一个图片。
 * 两处都只认图片，因此粘贴文本或 PDF 时返回 null，交给输入框的默认粘贴行为。
 */
export const findClipboardImage = (data: DataTransfer | null): File | null => {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return (
    Array.from(data.files ?? []).find((file) =>
      file.type?.startsWith('image/'),
    ) ?? null
  );
};

/**
 * 按 base64 开头的魔数反推 MIME。
 *
 * 历史消息只存正文，不存 MIME；上游用同一张前缀表兜底成 jpeg，这里保持同表同顺序。
 */
const MIME_SIGNATURES: ReadonlyArray<readonly [string, string]> = [
  ['iVBORw0KGgo', 'image/png'],
  ['/9j/', 'image/jpeg'],
  ['R0lGODdh', 'image/gif'],
  ['R0lGODlh', 'image/gif'],
  ['UklGR', 'image/webp'],
  ['Qk', 'image/bmp'],
];

export const inferImageMimeType = (base64: string): string =>
  MIME_SIGNATURES.find(([prefix]) => base64.startsWith(prefix))?.[1] ??
  'image/jpeg';

/** 拼出浏览器可渲染的 data URL；`mimeType` 缺失时按内容反推。 */
export const toImageDataUrl = (
  imageContent: string,
  mimeType?: string | null,
): string =>
  `data:${mimeType || inferImageMimeType(imageContent)};base64,${imageContent}`;

/** 把上传响应归一成待发送图片；失败时抛出可展示的中文文案。 */
export const normalizeUploadedImage = (
  response: ChatImageUploadResponse,
  originalName: string,
): UploadedImage => {
  if (!response.success || !response.image_content) {
    throw new Error(
      response.error ? `图片处理失败：${response.error}` : '图片上传失败，请重试。',
    );
  }
  return {
    imageContent: response.image_content,
    mimeType: response.mime_type || inferImageMimeType(response.image_content),
    originalName,
  };
};

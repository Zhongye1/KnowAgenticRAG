/**
 * 待发送图片的单槽预览。
 *
 * 只允许一张图，选新图直接覆盖旧图。移除按钮不做禁用：图片槽只在上传完成后才有内容，
 * 禁用只会让用户在流式期间卡住这张图。
 */
import { X } from 'lucide-react';

import { toImageDataUrl, type UploadedImage } from '../lib/image-upload';

type ImageAttachmentPreviewProps = {
  image: UploadedImage;
  onRemove: () => void;
};

export const ImageAttachmentPreview = ({
  image,
  onRemove,
}: ImageAttachmentPreviewProps) => (
  <div className="flex items-start gap-2" data-testid="image-attachment">
    <img
      src={toImageDataUrl(image.imageContent, image.mimeType)}
      alt={image.originalName || '待发送的图片'}
      className="max-h-24 w-fit rounded-medium border border-[var(--gray-150)]"
    />
    <button
      type="button"
      className="rounded-small border border-[var(--gray-150)] p-1 text-[var(--gray-800)] hover:text-[var(--gray-1000)]"
      aria-label="移除图片"
      onClick={onRemove}
    >
      <X className="size-4" aria-hidden />
    </button>
  </div>
);

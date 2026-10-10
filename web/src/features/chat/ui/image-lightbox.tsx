/**
 * 历史消息里的图片放大查看。
 *
 * 遮罩用固定定位实现。关闭有三条路：点图片外的遮罩（一个覆盖全屏的按钮）、按 Esc，
 * 以及浏览器后退（与打开状态无关）。
 */
import * as React from 'react';

type ImageLightboxProps = {
  src: string;
  alt?: string;
  onClose: () => void;
};

export const ImageLightbox = ({
  src,
  alt = '',
  onClose,
}: ImageLightboxProps) => {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-color-black/70 p-6"
      data-testid="image-lightbox"
    >
      <button
        type="button"
        aria-label="关闭图片预览"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <img
        src={src}
        alt={alt}
        className="relative max-h-full max-w-full rounded-medium"
      />
    </div>
  );
};

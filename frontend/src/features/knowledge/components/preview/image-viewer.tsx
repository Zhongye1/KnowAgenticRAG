import { ImageOff } from 'lucide-react';

import type { PreviewItem } from '@/generated/types';
import { PreviewCentered, PreviewFrame } from './preview-frame';

/**
 * 图片预览（kb 落地改造清单 Phase 3 / D55 §3A）。
 *
 * 图片走**预签名 URL 直连**（`url` 字段），不经服务端代理：单次请求、体积小、
 * `<img>` 直接可用，代理它只会白白让字节过服务端。PDF 才需要代理（见 `pdf-viewer`）。
 */
export const ImageViewer = ({ preview }: { preview: PreviewItem }) => {
  if (!preview.url) {
    return (
      <PreviewFrame>
        <PreviewCentered
          icon={<ImageOff className="size-5 opacity-60" />}
          title="图片地址获取失败"
        />
      </PreviewFrame>
    );
  }
  return (
    <PreviewFrame className="flex items-center justify-center p-2">
      <img
        src={preview.url}
        alt={preview.name}
        className="max-h-full max-w-full object-contain"
        loading="lazy"
      />
    </PreviewFrame>
  );
};

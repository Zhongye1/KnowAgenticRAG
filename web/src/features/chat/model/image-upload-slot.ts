/**
 * 单槽图片上传的状态层。
 *
 * 「输入框最多挂一张待发送图片」的全部状态与编排：校验、上传、上传世代号（切线程或
 * 连选两张时作废迟到的响应）、在途计数、粘贴与拖放入口。校验与归一化纯逻辑在
 * `lib/image-upload.ts`，网络调用在 `api/agent-api.ts`，本文件是它们的组合所有者。
 */
import * as React from 'react';

import { agentRunApi } from '../api/agent-api';
import {
  findClipboardImage,
  normalizeUploadedImage,
  validateImageFile,
  type UploadedImage,
} from '../lib/image-upload';

export type ImageUploadSlot = {
  /** 待发送的图片；null 表示槽是空的。 */
  image: UploadedImage | null;
  /** 清空图片槽并作废在途上传的回填（发送成功或切线程时用）。 */
  clear: () => void;
  /** 只作废在途上传（切线程时：图片槽本就不跟线程走，但迟到响应不能再写回）。 */
  invalidate: () => void;
  /** 在途上传数：不止一张图时，先回来的那张不能提前放开发送按钮。 */
  pendingUploads: number;
  /** 校验并上传一张图片；非法文件给出拒绝文案，不进槽。 */
  uploadFile: (file: File) => void;
  /** 粘贴图片即上传；文本粘贴不拦截，交给输入框的默认行为。 */
  onPaste: (event: React.ClipboardEvent<HTMLElement>) => void;
  /** 拖入多个文件时只取第一个图片；其余由用户重试。 */
  onDropFiles: (files: File[]) => void;
  /** file input 的 change 处理；先清 value，连续选同一张图也要触发。 */
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** 隐藏 file input 的 ref；「图片」按钮点击用。 */
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

export type ImageUploadSlotOptions = {
  /** 校验失败 / 上传失败时的提示出口。 */
  notifyError: (message: string) => void;
};

export const useImageUploadSlot = ({
  notifyError,
}: ImageUploadSlotOptions): ImageUploadSlot => {
  const [image, setImage] = React.useState<UploadedImage | null>(null);
  const [pendingUploads, setPendingUploads] = React.useState(0);
  // 上传世代号：切线程或又选了一张图都会作废更早的响应，
  // 否则迟到的响应会把上一张图写回已经换掉的输入框
  const generationRef = React.useRef(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const uploadFile = React.useCallback(
    (file: File) => {
      const invalid = validateImageFile(file);
      if (invalid) {
        notifyError(invalid);
        return;
      }
      const generation = (generationRef.current += 1);
      setPendingUploads((count) => count + 1);
      agentRunApi
        .uploadImage(file)
        .then((response) => {
          // 这次上传已经被切线程或更新的选择作废：不能再写回图片槽
          if (generationRef.current !== generation) return;
          setImage(normalizeUploadedImage(response, file.name));
        })
        .catch((error: unknown) => {
          if (generationRef.current !== generation) return;
          notifyError(
            error instanceof Error ? error.message : '图片上传失败，请重试。',
          );
        })
        .finally(() => {
          setPendingUploads((count) => Math.max(0, count - 1));
        });
    },
    [notifyError],
  );

  const onPaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLElement>) => {
      const file = findClipboardImage(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      uploadFile(file);
    },
    [uploadFile],
  );

  const onDropFiles = React.useCallback(
    (files: File[]) => {
      const [file] = files;
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  const onFileInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // 先清 value 再上传：连续选同一张图也要触发 change
      event.target.value = '';
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  return {
    image,
    clear: () => setImage(null),
    invalidate: () => {
      generationRef.current += 1;
    },
    pendingUploads,
    uploadFile,
    onPaste,
    onDropFiles,
    onFileInputChange,
    fileInputRef,
  };
};

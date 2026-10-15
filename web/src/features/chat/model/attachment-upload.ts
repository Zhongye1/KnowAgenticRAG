/** 附件上传的条目列表与操作。 */
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  confirmTmpThreadAttachments,
  listThreadAttachments,
  parseTmpAttachment,
  uploadTmpAttachment,
} from '../api/attachments-api';
import {
  canConfirm,
  hasBusyItems,
  toConfirmPayload,
  validateAttachmentFile,
  type AttachmentItem,
  type ThreadAttachment,
} from '../lib/attachment-upload';

export const attachmentKeys = {
  all: ['chat', 'attachments'] as const,
  thread: (threadId: string) => [...attachmentKeys.all, threadId] as const,
};

/**
 * 会话里已确认的附件。
 *
 * 它决定下一次发送要带上哪些附件 id：附件是单次使用的，被请求用掉之后就不该再下发。
 */
export const useThreadAttachments = (threadId: string | undefined) =>
  useQuery({
    queryKey: attachmentKeys.thread(threadId ?? ''),
    queryFn: () => listThreadAttachments(threadId ?? ''),
    enabled: Boolean(threadId),
  });

/**
 * 把刚确认的附件写进缓存。
 *
 * 新会话的附件列表还没拉回来，不写这一步的话，用户紧接着发的第一条消息会漏掉刚挂上的附件。
 */
export const useCacheThreadAttachments = () => {
  const queryClient = useQueryClient();

  return React.useCallback(
    (threadId: string, attachments: ThreadAttachment[]) => {
      queryClient.setQueryData(attachmentKeys.thread(threadId), attachments);
    },
    [queryClient],
  );
};

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const blankItem = (
  localId: string,
  file: File,
  error: string | null,
): AttachmentItem => ({
  localId,
  fileName: file.name,
  fileSize: file.size,
  fileType: file.type,
  objectName: '',
  parseSupported: false,
  parseMethods: [],
  selectedParseMethod: null,
  parsedObjectName: null,
  status: error ? 'error' : 'uploading',
  error,
  parseError: null,
});

export type AttachmentUpload = {
  items: AttachmentItem[];
  busy: boolean;
  canConfirm: boolean;
  /** 校验并上传一批文件；校验不过的条目直接落到错误态。 */
  addFiles: (files: File[]) => Promise<void>;
  /** 解析一条已上传的附件。 */
  parse: (item: AttachmentItem) => Promise<void>;
  /** 换解析方式；解析过的条目退回「已上传」，等重新解析。 */
  setParseMethod: (localId: string, method: string) => void;
  remove: (localId: string) => void;
  reset: () => void;
  /** 把可确认的条目绑到会话上；返回后端确认后的附件。 */
  confirm: (threadId: string) => Promise<ThreadAttachment[]>;
};

export const useAttachmentUpload = (
  options: {
    /** 系统配置里的默认 OCR 引擎；用来决定解析方式的默认值。 */
    configuredEngine?: unknown;
  } = {},
): AttachmentUpload => {
  const [items, setItems] = React.useState<AttachmentItem[]>([]);
  const seedRef = React.useRef(0);
  const configuredEngine = options.configuredEngine;

  const patch = React.useCallback(
    (localId: string, changes: Partial<AttachmentItem>) => {
      setItems((current) =>
        current.map((item) =>
          item.localId === localId ? { ...item, ...changes } : item,
        ),
      );
    },
    [],
  );

  const addFiles = React.useCallback(
    async (files: File[]) => {
      const entries = files.map((file) => ({
        file,
        localId: `att-${Date.now()}-${seedRef.current++}`,
        invalid: validateAttachmentFile(file),
      }));

      // 先把条目全部列出来：用户选了三个文件就该立刻看到三条，而不是等第一条传完才出现第二条
      setItems((current) => [
        ...current,
        ...entries.map((entry) =>
          blankItem(entry.localId, entry.file, entry.invalid),
        ),
      ]);

      await Promise.all(
        entries
          .filter((entry) => !entry.invalid)
          .map(async (entry) => {
            try {
              const uploaded = await uploadTmpAttachment(
                entry.file,
                configuredEngine,
              );
              patch(entry.localId, {
                ...uploaded,
                status: 'uploaded',
                error: null,
              });
            } catch (error) {
              patch(entry.localId, {
                status: 'error',
                error: errorMessage(error, '上传失败'),
              });
            }
          }),
      );
    },
    [configuredEngine, patch],
  );

  const parse = React.useCallback(
    async (item: AttachmentItem) => {
      if (!item.objectName || !item.selectedParseMethod) return;

      // 换过解析方式就丢掉上一次的结果：它对应的不是当前方式
      patch(item.localId, {
        status: 'parsing',
        parseError: null,
        parsedObjectName: null,
      });
      try {
        const parsedObjectName = await parseTmpAttachment({
          objectName: item.objectName,
          parseMethod: item.selectedParseMethod,
        });
        patch(item.localId, { status: 'parsed', parsedObjectName });
      } catch (error) {
        patch(item.localId, {
          status: 'uploaded',
          parsedObjectName: null,
          parseError: errorMessage(error, '解析失败'),
        });
      }
    },
    [patch],
  );

  const setParseMethod = React.useCallback(
    (localId: string, method: string) => {
      setItems((current) =>
        current.map((item) =>
          item.localId === localId
            ? {
                ...item,
                selectedParseMethod: method,
                parsedObjectName: null,
                parseError: null,
                status: item.status === 'parsed' ? 'uploaded' : item.status,
              }
            : item,
        ),
      );
    },
    [],
  );

  const remove = React.useCallback((localId: string) => {
    setItems((current) => current.filter((item) => item.localId !== localId));
  }, []);

  const reset = React.useCallback(() => setItems([]), []);

  const confirm = React.useCallback(
    async (threadId: string): Promise<ThreadAttachment[]> =>
      confirmTmpThreadAttachments({
        threadId,
        attachments: toConfirmPayload(items),
      }),
    [items],
  );

  return {
    items,
    busy: hasBusyItems(items),
    canConfirm: canConfirm(items),
    addFiles,
    parse,
    setParseMethod,
    remove,
    reset,
    confirm,
  };
};

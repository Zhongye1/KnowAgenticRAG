/**
 * 文件预览的状态层。
 *
 * 缓存与回收都走 `lib/panel-preview.ts` 的纯函数：这里是它们的唯一所有者，负责在正确的时机
 * （加载完成、重载、淘汰）传入 `revokeObjectURL`。
 */
import * as React from 'react';

import { downloadFileEntry, fetchFileContent } from '../api/filesystem-api';
import {
  describePreviewError,
  invalidatePreviewCacheEntry,
  previewCacheKey,
  prunePreviewCache,
  settlePreviewCacheLoad,
  type PreviewCache,
  type PreviewCacheEntry,
  type PreviewFile,
} from '../lib/panel-preview';

export type PanelPreview = {
  /** 当前分区正在展示的文件；null 表示还没有可展示的内容。 */
  current: PreviewFile | null;
  /** 打开（或激活）一个文件的预览。 */
  open: (input: { scope: 'thread' | 'workspace'; path: string; name: string }) => void;
  /** 关闭当前预览。 */
  close: () => void;
  /** 重新加载当前文件；用于轮询发现文件变化后。 */
  reload: () => Promise<void>;
  /** 下载一个文件（预览里的或树节点上的）；返回是否触发了下载。 */
  download: (input: {
    scope: 'thread' | 'workspace';
    path: string;
    name: string;
  }) => Promise<boolean>;
};

const revokeObjectURL = (url: string): void => {
  if (url && typeof window !== 'undefined' && window.URL?.revokeObjectURL) {
    window.URL.revokeObjectURL(url);
  }
};

export const usePanelPreview = (options: {
  threadId?: string;
  /** 轮询发现文件变化后通知这里重载；空表示不重载。 */
  reloadToken?: number;
}): PanelPreview => {
  const cacheRef = React.useRef<PreviewCache>(new Map());
  const [current, setCurrent] = React.useState<PreviewFile | null>(null);
  const [target, setTarget] = React.useState<{
    scope: 'thread' | 'workspace';
    path: string;
    name: string;
  } | null>(null);
  const requestSeqRef = React.useRef(0);

  const open = React.useCallback(
    (input: { scope: 'thread' | 'workspace'; path: string; name: string }) => {
      setTarget(input);

      const cacheKey = previewCacheKey({
        scope: input.scope,
        threadId: options.threadId,
        path: input.path,
      });
      const cached = cacheRef.current.get(cacheKey);
      if (cached?.status === 'ready') {
        cached.lastAccessed = Date.now();
        setCurrent({ ...cached.file, status: 'ready' });
        prunePreviewCache({
          cache: cacheRef.current,
          activeKey: cacheKey,
          revokeObjectURL,
        });
        return;
      }

      // 先给占位，再发请求；条目与占位共享同一个对象引用，发布时用它核对是否过期
      const placeholder: PreviewFile = {
        path: input.path,
        name: input.name,
        status: 'loading',
        previewType: 'text',
        supported: true,
        content: null,
        previewUrl: '',
        message: '',
        truncated: false,
      };
      setCurrent(placeholder);
      const loadingEntry: PreviewCacheEntry = {
        status: 'loading',
        file: placeholder,
        lastAccessed: Date.now(),
      };
      cacheRef.current.set(cacheKey, loadingEntry);

      const requestSeq = ++requestSeqRef.current;
      void (async () => {
        try {
          const file = await fetchFileContent({
            scope: input.scope,
            threadId: options.threadId,
            path: input.path,
            name: input.name,
          });
          const published = settlePreviewCacheLoad({
            cache: cacheRef.current,
            cacheKey,
            loadingEntry,
            nextFile: file,
            lastAccessed: Date.now(),
            revokeObjectURL,
          });
          // 只有关键请求还是当前请求时才上屏
          if (requestSeq === requestSeqRef.current && published) setCurrent(file);
        } catch (error) {
          cacheRef.current.delete(cacheKey);
          if (requestSeq === requestSeqRef.current) {
            setCurrent({
              ...placeholder,
              status: 'error',
              message: describePreviewError(error),
            });
          }
        } finally {
          prunePreviewCache({
            cache: cacheRef.current,
            activeKey: cacheKey,
            revokeObjectURL,
          });
        }
      })();
    },
    [options.threadId],
  );

  const close = React.useCallback(() => {
    requestSeqRef.current += 1;
    const currentFile = current;
    // 离开当前预览时回收它的 URL；缓存里还有一份，等淘汰时再收
    if (currentFile?.previewUrl) revokeObjectURL(currentFile.previewUrl);
    setCurrent(null);
    setTarget(null);
  }, [current]);

  const reload = React.useCallback(async () => {
    if (!target) return;

    const cacheKey = previewCacheKey({
      scope: target.scope,
      threadId: options.threadId,
      path: target.path,
    });
    // 变化过的文件不能再用旧缓存
    invalidatePreviewCacheEntry({
      cache: cacheRef.current,
      cacheKey,
      revokeObjectURL,
    });
    open(target);
  }, [target, options.threadId, open]);

  // 轮询发现文件变化时重载当前预览
  const firstToken = React.useRef(options.reloadToken);
  React.useEffect(() => {
    if (options.reloadToken === undefined) return;
    if (firstToken.current === options.reloadToken) return;
    firstToken.current = options.reloadToken;
    void reload();
  }, [options.reloadToken, reload]);

  // 线程切换：整份缓存作废（URL 全部回收）
  React.useEffect(() => {
    for (const [, entry] of cacheRef.current) {
      if (entry.file.previewUrl) revokeObjectURL(entry.file.previewUrl);
    }
    cacheRef.current.clear();
    setCurrent(null);
    setTarget(null);
  }, [options.threadId]);

  const download = React.useCallback(
    async (input: {
      scope: 'thread' | 'workspace';
      path: string;
      name: string;
    }): Promise<boolean> => {
      try {
        const { ok } = await downloadFileEntry({
          scope: input.scope,
          threadId: options.threadId,
          path: input.path,
          fallbackName: input.name,
        });

        return ok;
      } catch (error) {
        console.warn('下载失败:', input.path, error);

        return false;
      }
    },
    [options.threadId],
  );

  return { current, open, close, reload, download };
};

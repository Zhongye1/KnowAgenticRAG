/**
 * 产物动作的状态层：下载与保存到个人空间。
 *
 * 在途保存路径集合（卡片按钮据此显示保存中）也在这里；页面只把通知出口注入进来。
 * 网络调用在 `api/artifacts-api.ts`，`ArtifactItem` 的提取与归一在 `lib/artifacts.ts`。
 */
import * as React from 'react';

import { downloadThreadArtifact, saveThreadArtifact } from '../api/artifacts-api';
import type { ArtifactItem } from '../lib/artifacts';

export type ArtifactActions = {
  /** 正在保存到个人空间的产物路径；卡片按钮据此显示保存中。 */
  savingPaths: ReadonlySet<string>;
  download: (threadId: string | null | undefined, artifact: ArtifactItem) => void;
  save: (threadId: string | null | undefined, artifact: ArtifactItem) => void;
};

export type ArtifactActionsOptions = {
  notifyError: (message: string) => void;
  notifySuccess: (message: string) => void;
};

export const useArtifactActions = ({
  notifyError,
  notifySuccess,
}: ArtifactActionsOptions): ArtifactActions => {
  const [savingPaths, setSavingPaths] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const download = React.useCallback(
    (threadId: string | null | undefined, artifact: ArtifactItem) => {
      if (!threadId) return;
      void downloadThreadArtifact({
        threadId,
        path: artifact.path,
        fallbackName: artifact.name,
      }).then(({ ok }) => {
        if (!ok) notifyError('下载文件失败');
      });
    },
    [notifyError],
  );

  const save = React.useCallback(
    (threadId: string | null | undefined, artifact: ArtifactItem) => {
      if (!threadId) return;
      setSavingPaths((current) => new Set(current).add(artifact.path));
      void saveThreadArtifact({ threadId, path: artifact.path })
        .then(({ savedPath }) => {
          notifySuccess(`已保存到个人空间：${savedPath}`);
        })
        .catch((error: unknown) => {
          notifyError(
            error instanceof Error ? error.message : '保存到个人空间失败',
          );
        })
        .finally(() => {
          setSavingPaths((current) => {
            const next = new Set(current);
            next.delete(artifact.path);
            return next;
          });
        });
    },
    [notifyError, notifySuccess],
  );

  return { savingPaths, download, save };
};

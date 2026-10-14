/**
 * 对话流里的产物卡片。
 *
 * 参照的 `AgentArtifactsCard`；保存到个人空间的目录选择由页面级
 * 通知与默认目录承担，卡片自身只管条目渲染与三个动作。
 */
import * as React from 'react';
import { Download, FolderInput, Loader2 } from 'lucide-react';

import { Button } from 'antd';

import { artifactMetaLabel, type ArtifactItem } from '../lib/artifacts';

export type ArtifactsCardProps = {
  artifacts: ArtifactItem[];
  threadId?: string | null;
  savingPaths?: ReadonlySet<string>;
  onOpenPreview?: (artifact: ArtifactItem) => void;
  onDownload?: (artifact: ArtifactItem) => void;
  onSave?: (artifact: ArtifactItem) => void;
};

export const ArtifactsCard = ({
  artifacts,
  threadId,
  savingPaths,
  onOpenPreview,
  onDownload,
  onSave,
}: ArtifactsCardProps) => {
  if (artifacts.length === 0) return null;

  return (
    <section aria-label="交付物" className="flex w-full flex-col gap-2 py-1">
      {artifacts.map((artifact) => {
        const saving = savingPaths?.has(artifact.path) ?? false;
        return (
          <div
            key={artifact.path}
            className="flex w-full items-center justify-between gap-1.5 rounded-large border border-[var(--gray-150)] bg-[var(--gray-0)] px-2 py-1.5 transition-colors hover:border-[var(--gray-200)]"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              title={threadId ? `打开 ${artifact.name}` : artifact.name}
              aria-label={`打开 ${artifact.name}`}
              onClick={() => onOpenPreview?.(artifact)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[var(--gray-1000)]">
                  {artifact.name}
                </span>
                <span className="block text-xs text-[var(--gray-500)]">
                  {artifactMetaLabel(artifact.path)}
                </span>
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="text"
                size="small"
                className="size-6 [&_svg]:size-3"
                title="下载"
                aria-label={`下载 ${artifact.name}`}
                onClick={() => onDownload?.(artifact)}
              >
                <Download className="size-3.5" />
              </Button>
              <Button
                type="text"
                size="small"
                className="size-6 [&_svg]:size-3"
                title={saving ? '保存中' : '保存到个人空间'}
                aria-label={`保存 ${artifact.name} 到个人空间`}
                disabled={saving || !threadId}
                onClick={() => onSave?.(artifact)}
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FolderInput className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
};

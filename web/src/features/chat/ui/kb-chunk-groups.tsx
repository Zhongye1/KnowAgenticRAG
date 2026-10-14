/**
 * 知识库片段的文件分组列表。
 *
 * 检索结果主体与「来源」面板共用它。`showSummary` 控制那句「找到 N 个相关文档片段，
 * 来自 M 个文件」——来源面板里已有「知识库来源 (N)」标题，再报一次数量是重复的。
 *
 * 与参照的差别：参照点开文件会弹「片段」与「文件详情」两个弹窗，后者属于知识库切片；
 * 这里改成行内展开，避免 `features/chat` 反向依赖知识库。
 */
import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import {
  groupChunksByFile,
  kbChunkSummary,
  type KbQueryChunk,
} from '../lib/kb-query-result';

/** 片段正文的展示上限，避免一条命中撑满整屏。 */
const CHUNK_PREVIEW_MAX_LENGTH = 300;

const preview = (text: string, maxLength = CHUNK_PREVIEW_MAX_LENGTH): string =>
  text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;

const scoreLabel = (score: number | null): string =>
  score === null ? '' : `相关度 ${(score * 100).toFixed(1)}%`;

type KbChunkGroupsProps = {
  chunks: KbQueryChunk[];
  showSummary?: boolean;
};

export const KbChunkGroups = ({
  chunks,
  showSummary = true,
}: KbChunkGroupsProps) => {
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);
  const fileGroups = groupChunksByFile(chunks);
  const summary = kbChunkSummary(chunks);

  return (
    <div className="flex flex-col gap-3">
      {showSummary && summary ? (
        <p className="text-[var(--gray-500)]">{summary}</p>
      ) : null}

      {fileGroups.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {fileGroups.map((group) => {
            const expanded = expandedKey === group.key;

            return (
              <li key={group.key} className="flex flex-col">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-medium border border-[var(--gray-150)] px-2 py-1 text-left"
                  aria-expanded={expanded}
                  aria-label={`查看 ${group.filename} 的检索片段`}
                  onClick={() => setExpandedKey(expanded ? null : group.key)}
                >
                  {expanded ? (
                    <ChevronDown className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4 shrink-0" aria-hidden />
                  )}
                  <span
                    className="min-w-0 flex-1 truncate text-[var(--gray-1000)]"
                    title={group.filename}
                  >
                    {group.filename}
                  </span>
                  <span className="shrink-0 text-[var(--gray-500)]">
                    {group.chunks.length} 个片段
                  </span>
                </button>

                {expanded ? (
                  <ul className="mt-1 flex flex-col gap-2 pl-6">
                    {group.chunks.map((chunk, index) => (
                      <li
                        key={`${group.key}-${index}`}
                        className="flex flex-col gap-1 border-l border-[var(--gray-150)] pl-3"
                      >
                        {chunk.score !== null ? (
                          <span className="text-xs text-[var(--gray-500)]">
                            {scoreLabel(chunk.score)}
                          </span>
                        ) : null}
                        <p className="whitespace-pre-wrap text-[var(--gray-800)]">
                          {preview(chunk.content)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};

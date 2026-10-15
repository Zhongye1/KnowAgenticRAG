/**
 * 网络搜索结果列表。
 *
 * 逐条渲染标题（外链）、相关度与摘要；没有结构化结果时由调用方决定是展示原文还是
 * 空态，本组件只负责「有结果」与「没有结果」两种呈现。
 */
import type { WebSearchResult } from '../lib/web-search-results';

type WebSearchResultsProps = {
  results: WebSearchResult[];
};

/** 相关度按百分数展示一位小数；没有分数时不渲染这一项。 */
const formatScore = (score: number): string => `${(score * 100).toFixed(1)}%`;

export const WebSearchResults = ({ results }: WebSearchResultsProps) => {
  if (results.length === 0) {
    return (
      <p className="py-3 text-center text-xs text-[var(--gray-500)]">
        未找到相关搜索结果
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {results.map((result, index) => (
        <li
          key={result.url || `${result.title}-${index}`}
          className="rounded-medium border border-[var(--gray-150)] bg-[var(--gray-25)] p-2.5"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <h5 className="min-w-0 flex-1 truncate text-sm">
              {result.url ? (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--main-600)] hover:underline"
                >
                  {result.title}
                </a>
              ) : (
                <span className="font-medium text-[var(--gray-1000)]">
                  {result.title}
                </span>
              )}
            </h5>
            {result.score !== null ? (
              <span className="shrink-0 rounded-large bg-[var(--gray-100)] px-1.5 text-xs text-[var(--gray-500)]">
                相关度: {formatScore(result.score)}
              </span>
            ) : null}
          </div>

          {result.content ? (
            <p className="line-clamp-2 text-xs text-[var(--gray-800)]">
              {result.content}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
};

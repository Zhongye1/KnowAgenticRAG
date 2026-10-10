/**
 * 检索测试面板。
 *
 * 查询框（回车提交）、结果按相似度/重排序分数、来源、文件 ID、块索引与距离展示，示例问题
 * 一键填入，空结果与失败分开呈现。
 *
 * 失败结果不当结果渲染：API 层把 200 + `{status:'failed'}` 折成异常，这里按失败提示。
 * 参数面板（可编辑的检索参数）尚未接入，本面板只读用后端下发的默认值。
 */
import * as React from 'react';
import { Search } from 'lucide-react';

import type { QueryTestChunk } from '../api/knowledge-api';
import { buildQueryMeta } from '../lib/knowledge-query-params';
import {
  useKnowledgeQueryParams,
  useSampleQuestions,
} from '../model/knowledge-queries';
import { knowledgeApi } from '../api/knowledge-api';
import { Button } from '@/shared/ui/button';
import { Empty } from '@/shared/ui/empty';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

type QueryTestPanelProps = {
  kbId: string;
};

const formatPercent = (value?: number | null): string =>
  typeof value === 'number' ? `${(value * 100).toFixed(2)}%` : '';

export const QueryTestPanel = ({ kbId }: QueryTestPanelProps) => {
  const params = useKnowledgeQueryParams(kbId);
  const examples = useSampleQuestions(kbId);

  const [query, setQuery] = React.useState('');
  const [chunks, setChunks] = React.useState<QueryTestChunk[] | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const onSubmit = async () => {
    const text = query.trim();
    if (!text) {
      setError('请输入查询内容。');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const meta = buildQueryMeta(params.data ?? { options: [] });
      setChunks(await knowledgeApi.queryTest(kbId, text, meta));
    } catch (submitError) {
      setChunks(null);
      setError(
        submitError instanceof Error ? submitError.message : '检索测试失败。',
      );
    } finally {
      setLoading(false);
    }
  };

  const sampleQuestions = examples.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="检索测试查询"
          placeholder="输入问题，回车开始检索"
          value={query}
          className="max-w-xl flex-1"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void onSubmit();
          }}
        />
        <Button
          type="button"
          disabled={loading}
          onClick={() => void onSubmit()}
        >
          <Search className="size-4" aria-hidden />
          检索
        </Button>
      </div>

      {sampleQuestions.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="示例问题">
          {sampleQuestions.map((question) => (
            <li key={question}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuery(question)}
              >
                {question}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-color-text-3">
          <Spinner aria-hidden className="size-4" />
          正在检索…
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger-6">
          {error}
        </p>
      ) : null}

      {chunks && chunks.length === 0 ? (
        <Empty description="没有命中任何分块。" />
      ) : null}

      {chunks && chunks.length > 0 ? (
        <>
          <p className="text-xs text-color-text-3">共 {chunks.length} 条结果</p>
          <ul className="flex flex-col gap-2" data-testid="query-test-results">
            {chunks.map((chunk, index) => (
              <li
                key={`${index}-${chunk.metadata?.file_id ?? ''}`}
                className="flex flex-col gap-1 rounded-large border border-color-border-1 p-3"
              >
                <span className="flex flex-wrap items-center gap-3 text-xs text-color-text-3">
                  {typeof chunk.score === 'number' ? (
                    <span>相似度: {formatPercent(chunk.score)}</span>
                  ) : null}
                  {typeof chunk.rerank_score === 'number' ? (
                    <span>重排序分数: {formatPercent(chunk.rerank_score)}</span>
                  ) : null}
                  {typeof chunk.distance === 'number' ? (
                    <span>距离: {chunk.distance.toFixed(4)}</span>
                  ) : null}
                  <span>#{index + 1}</span>
                </span>
                <p className="text-sm text-color-text-1">{chunk.content}</p>
                <span className="flex flex-wrap gap-3 text-xs text-color-text-3">
                  {chunk.metadata?.source ? (
                    <span>来源: {chunk.metadata.source}</span>
                  ) : null}
                  {chunk.metadata?.file_id ? (
                    <span>文件ID: {chunk.metadata.file_id}</span>
                  ) : null}
                  {typeof chunk.metadata?.chunk_index === 'number' ? (
                    <span>块索引: {chunk.metadata.chunk_index}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
};

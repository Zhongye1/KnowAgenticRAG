/**
 * 检索测试面板。
 *
 * 对齐参照 `QuerySection.vue`：一张输入卡片（多行文本域 + 「Enter 检索知识库内容」提示 +
 * 原始数据切换 + 圆形主色提交），下面按状态二选一地铺结果区或示例问题列表。
 *
 * 结果区有两态：格式化（命中摘要 + 结果项）与原始 JSON（整个响应体的 `<pre>`）。
 * 示例问题打乱后只取前 10 条，点一行直接发起检索；生成示例问题是写操作，只给 `can_manage`。
 *
 * 失败不当结果渲染：API 层把 200 + `{status:'failed'}` 折成异常，这里按失败提示；这与参照的
 * `message.error` 不同，是本仓的既有约定（见 gaps 1.11）。
 */
import * as React from 'react';
import { Braces, RefreshCw, Search } from 'lucide-react';
import { Button, Input, Spin, Tooltip } from 'antd';

import type { QueryTestChunk } from '../../api/knowledge-api';
import { knowledgeApi } from '../../api/knowledge-api';
import { buildQueryMeta } from '../../lib/knowledge-query-params';
import {
  useGenerateSampleQuestions,
  useKnowledgeQueryParams,
  useSampleQuestions,
} from '../../model/knowledge-queries';
import { useNotifications } from '@/shared/ui/notifications';

import styles from './query-test-panel.module.css';

type QueryTestPanelProps = {
  kbId: string;
  /** 只读知识库：隐藏生成示例问题的入口（写操作，后端也要求管理权限）。 */
  readOnly: boolean;
};

/** 示例问题最多显示几条（参照 `MAX_VISIBLE_EXAMPLES`）。 */
const MAX_VISIBLE_EXAMPLES = 10;

const formatPercent = (value?: number | null): string =>
  typeof value === 'number' ? `${(value * 100).toFixed(2)}%` : '';

/** 打乱一份示例问题；每次取数只做一次，重渲染不重排。 */
const shuffle = (list: string[]): string[] => {
  const next = [...list];
  for (let index = next.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
};

export const QueryTestPanel = ({ kbId, readOnly }: QueryTestPanelProps) => {
  const params = useKnowledgeQueryParams(kbId);
  const examples = useSampleQuestions(kbId);
  const generateQuestions = useGenerateSampleQuestions(kbId);
  const { addNotification } = useNotifications();

  const [query, setQuery] = React.useState('');
  const [chunks, setChunks] = React.useState<QueryTestChunk[] | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [showRawData, setShowRawData] = React.useState(false);

  const runQuery = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('请输入查询内容。');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const meta = buildQueryMeta(params.data ?? { options: [] });
      setChunks(await knowledgeApi.queryTest(kbId, trimmed, meta));
    } catch (submitError) {
      setChunks(null);
      setError(
        submitError instanceof Error ? submitError.message : '检索测试失败。',
      );
    } finally {
      setLoading(false);
    }
  };

  const sampleQuestions = React.useMemo(
    () => shuffle(examples.data ?? []).slice(0, MAX_VISIBLE_EXAMPLES),
    [examples.data],
  );

  /** 点一行示例：填进输入框并立刻检索（参照的 `useQueryExample`）。 */
  const useExample = (question: string) => {
    setQuery(question);
    void runQuery(question);
  };

  const onGenerate = async () => {
    try {
      const generated =
        await generateQuestions.mutateAsync(MAX_VISIBLE_EXAMPLES);
      if (generated.length > 0) {
        addNotification({
          type: 'success',
          title: '示例问题',
          message: `成功生成 ${generated.length} 个测试问题`,
        });
      }
    } catch (generateError) {
      addNotification({
        type: 'error',
        title: '示例问题',
        message:
          generateError instanceof Error
            ? `生成失败: ${generateError.message}`
            : '生成失败。',
      });
    }
  };

  const generating = generateQuestions.isPending;
  const questionsLoading = examples.isPending;
  // 有结果或正在检索时，示例问题让位（参照的 `showQuerySuggestions`）
  const showSuggestions = !loading && chunks === null;

  return (
    <div className="flex flex-col gap-3 py-2">
      <div className={styles.inputCard}>
        <Input.TextArea
          aria-label="检索测试查询"
          placeholder="输入查询内容..."
          autoSize={{ minRows: 2, maxRows: 6 }}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onPressEnter={(event) => {
            // Shift+回车留给换行，其余回车直接检索
            if (event.shiftKey) return;
            event.preventDefault();
            void runQuery(query);
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs leading-6 text-[var(--gray-500)] max-md:hidden">
            Enter 检索知识库内容
          </span>
          <div className="flex items-center gap-3">
            <Tooltip
              title={showRawData ? '切换至格式化显示' : '切换至原始数据'}
            >
              <Button
                htmlType="button"
                type="text"
                shape="circle"
                aria-label="切换原始数据"
                aria-pressed={showRawData}
                className={`${styles.formatToggle} ${showRawData ? styles.formatToggleActive : ''}`}
                onClick={() => setShowRawData((current) => !current)}
              >
                <Braces className="size-[18px]" aria-hidden />
              </Button>
            </Tooltip>
            <Tooltip title="检索">
              <Button
                htmlType="button"
                type="primary"
                shape="circle"
                aria-label="检索"
                loading={loading}
                disabled={!query.trim()}
                className={styles.submitButton}
                onClick={() => void runQuery(query)}
              >
                {loading ? null : <Search className="size-4" aria-hidden />}
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger-6">
          {error}
        </p>
      ) : null}

      {chunks !== null ? (
        <div className="flex flex-col">
          {showRawData ? (
            <pre className="m-0 overflow-x-auto rounded-[6px] border border-[var(--gray-200)] bg-[var(--gray-50)] p-4 text-xs leading-relaxed text-[var(--gray-1000)] whitespace-pre-wrap break-words">
              {JSON.stringify(chunks, null, 2)}
            </pre>
          ) : chunks.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--gray-500)]">
              未找到相关结果
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3 rounded-[6px] bg-[var(--main-50)] px-3.5 py-2.5 text-[13px] text-[var(--gray-800)]">
                <span className="font-medium">
                  检索到 {chunks.length} 个相关文档块：
                </span>
                <Button
                  htmlType="button"
                  type="text"
                  size="small"
                  className={styles.clearButton}
                  onClick={() => setChunks(null)}
                >
                  清空
                </Button>
              </div>
              <ul
                className="flex flex-col gap-3"
                data-testid="query-test-results"
              >
                {chunks.map((chunk, index) => (
                  <li
                    key={`${index}-${chunk.metadata?.file_id ?? ''}`}
                    className="rounded-[6px] border border-[var(--gray-200)] bg-[var(--gray-0)] p-3 transition-colors hover:border-[var(--main-300)]"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-3 border-b border-[var(--gray-150)] pb-2">
                      <span className="text-sm font-semibold text-[var(--main-color)]">
                        #{index + 1}
                      </span>
                      {typeof chunk.score === 'number' ? (
                        <span className="rounded-[12px] bg-[var(--gray-100)] px-2 py-0.5 text-xs text-[var(--gray-700)]">
                          相似度: {formatPercent(chunk.score)}
                        </span>
                      ) : null}
                      {typeof chunk.rerank_score === 'number' ? (
                        <span className="rounded-[12px] bg-[var(--color-warning-50)] px-2 py-0.5 text-xs text-[var(--color-warning-700)]">
                          重排序分数: {formatPercent(chunk.rerank_score)}
                        </span>
                      ) : null}
                    </div>
                    <p className="py-2 text-[13px] leading-relaxed text-[var(--gray-900)] whitespace-pre-wrap break-words">
                      {chunk.content}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 border-t border-[var(--gray-150)] pt-2">
                      {chunk.metadata?.source ? (
                        <span className="text-xs text-[var(--gray-700)]">
                          <strong className="mr-1 font-medium text-[var(--gray-500)]">
                            来源:
                          </strong>{' '}
                          {chunk.metadata.source}
                        </span>
                      ) : null}
                      {chunk.metadata?.file_id ? (
                        <span className="text-xs text-[var(--gray-700)]">
                          <strong className="mr-1 font-medium text-[var(--gray-500)]">
                            文件ID:
                          </strong>{' '}
                          {chunk.metadata.file_id}
                        </span>
                      ) : null}
                      {typeof chunk.metadata?.chunk_index === 'number' ? (
                        <span className="text-xs text-[var(--gray-700)]">
                          <strong className="mr-1 font-medium text-[var(--gray-500)]">
                            块索引:
                          </strong>{' '}
                          {chunk.metadata.chunk_index}
                        </span>
                      ) : null}
                      {typeof chunk.distance === 'number' ? (
                        <span className="text-xs text-[var(--gray-700)]">
                          <strong className="mr-1 font-medium text-[var(--gray-500)]">
                            距离:
                          </strong>{' '}
                          {chunk.distance.toFixed(4)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {showSuggestions ? (
        <div className="flex flex-col">
          {questionsLoading || generating ? (
            <p className="flex min-h-[72px] items-center justify-center gap-1.5 text-[13px] text-[var(--gray-500)]">
              <Spin aria-hidden className="size-4" />
              {generating ? '正在生成示例问题...' : '正在加载示例问题...'}
            </p>
          ) : sampleQuestions.length > 0 ? (
            <div className="flex flex-col items-start gap-3">
              <span className="text-xs font-semibold leading-5 text-[var(--gray-600)]">
                示例问题
              </span>
              {sampleQuestions.map((question, index) => (
                <button
                  key={`${index}-${question}`}
                  type="button"
                  data-testid="sample-question"
                  className={styles.suggestionRow}
                  onClick={() => useExample(question)}
                >
                  <Search className={styles.suggestionIcon} aria-hidden />
                  <span className="min-w-0 flex-1 text-[13px] leading-normal break-words">
                    {question}
                  </span>
                </button>
              ))}
              {readOnly ? null : (
                <button
                  type="button"
                  className={styles.suggestionRow}
                  onClick={() => void onGenerate()}
                >
                  <RefreshCw className={styles.suggestionIcon} aria-hidden />
                  <span className="min-w-0 flex-1 text-[13px] leading-normal break-words">
                    重新生成
                  </span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex min-h-[72px] items-center justify-center">
              {readOnly ? (
                <span className="text-[13px] text-[var(--gray-500)]">
                  暂无示例问题
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.suggestionRow}
                  onClick={() => void onGenerate()}
                >
                  <RefreshCw className={styles.suggestionIcon} aria-hidden />
                  <span className="min-w-0 flex-1 text-[13px] leading-normal break-words">
                    生成示例问题
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

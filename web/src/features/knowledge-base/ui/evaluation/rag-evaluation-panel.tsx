/**
 * RAG 评估分区：启动评估、最近一次结果卡片、运行历史与结果详情。
 *
 * 没有可用基准时引导去「评估基准」；有基准但没跑过时给空态；有历史时顶部是最近一次的评分卡
 * （评分环 + 四个指标卡），下面是运行历史表（每页 10）。启动表单在下拉里：评估名称、评估基准、
 * 答案生成模型、答案评判模型；两个模型必须同时选或同时不选，没有标准答案的基准只跑检索评估。
 *
 * 指标一律来自运行本身（`metrics`/`overall_score`），不按当前页现算，避免口径随翻页漂移。
 */
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Empty as SharedEmpty } from '@/shared/ui/empty';
import { Progress } from '@/shared/ui/progress';
import { Button, Dropdown, Input, Select, Spin } from 'antd';
import { useNotifications } from '@/shared/ui/notifications';
import { useConfirm } from '@/shared/ui/confirm-dialog';

import type {
  EvaluationDataset,
  EvaluationRun,
} from '../../api/evaluation-api';
import {
  answerScore,
  answerVerdict,
  datasetNameOf,
  evaluableDatasets,
  latestRun,
  retrievalMetricEntries,
  runCompletion,
  runDuration,
  runProgress,
  runProgressMessage,
  runStatusView,
} from '../../lib/evaluation-view';
import { PanelStateBox } from '../panel-state';
import {
  evaluationStartHint,
  validateEvaluationStart,
} from '../../lib/evaluation-form';
import { buildDefaultEvaluationName } from '../../lib/evaluation-form';
import {
  formatMetricValue,
  formatPercent,
  metricPlaceholder,
  metricTone,
} from '../../lib/evaluation-view';
import {
  evaluationKeys,
  useDeleteEvaluationRun,
  useEvaluationDatasets,
  useEvaluationRuns,
  useEvaluationRunResults,
  useRunEvaluation,
} from '../../model/evaluation-queries';
import { useExtractorModels } from '../../model/graph-queries';

const HISTORY_PAGE_SIZE = 10;
const RESULT_PAGE_SIZE = 50;

const TONE_TEXT = {
  success: 'text-success-6',
  warning: 'text-warning-6',
  danger: 'text-danger-6',
} as const;

const MetricValue = ({
  value,
  digits,
  placeholder = '-',
}: {
  value: unknown;
  digits?: number;
  /** 没有数值时的文案；调用方按运行状态给「计算中 / 无数据 / -」。 */
  placeholder?: string;
}) => {
  const tone = metricTone(value);
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const text = numeric
    ? digits === undefined
      ? formatMetricValue(value)
      : formatPercent(value, digits)
    : placeholder;
  return (
    <span className={tone ? TONE_TEXT[tone] : 'text-color-text-3'}>{text}</span>
  );
};

/** 评分环：纯 CSS。 */
const ScoreRing = ({ score }: { score: number | null }) => {
  const percent = score === null ? 0 : Math.round(score * 100);
  return (
    <div
      className="flex size-16 items-center justify-center rounded-full border-2 border-color-border-1 text-sm font-medium text-color-text-1"
      style={{
        backgroundImage: `conic-gradient(rgb(var(--color-primary-6)) ${percent}%, rgb(var(--color-fill-2)) ${percent}% 100%)`,
      }}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-color-bg-1">
        {score === null ? '-' : `${percent}%`}
      </span>
    </div>
  );
};

export type RagEvaluationPanelProps = {
  kbId: string;
  readOnly: boolean;
  /** 当前分区是否激活。 */
  active: boolean;
  /** 没有可用基准时跳到「评估基准」分区。 */
  onGoToBenchmarks: () => void;
};

export const RagEvaluationPanel = ({
  kbId,
  readOnly,
  active,
  onGoToBenchmarks,
}: RagEvaluationPanelProps) => {
  const { confirm } = useConfirm();
  const notifications = useNotifications();
  const queryClient = useQueryClient();
  const runs = useEvaluationRuns(kbId);
  const datasets = useEvaluationDatasets(kbId);
  const models = useExtractorModels();
  const start = useRunEvaluation(kbId);
  const remove = useDeleteEvaluationRun(kbId);

  const available = React.useMemo(
    () => evaluableDatasets(datasets.data),
    [datasets.data],
  );
  const [configOpen, setConfigOpen] = React.useState(false);
  const [name, setName] = React.useState(() => buildDefaultEvaluationName());
  const [datasetId, setDatasetId] = React.useState('');
  const [answerLlm, setAnswerLlm] = React.useState('');
  const [judgeLlm, setJudgeLlm] = React.useState('');
  const [error, setError] = React.useState('');
  const [historyPage, setHistoryPage] = React.useState(1);
  const [detailRunId, setDetailRunId] = React.useState<string | null>(null);
  const [detailPage, setDetailPage] = React.useState(1);
  const [errorOnly, setErrorOnly] = React.useState(false);

  const detail = useEvaluationRunResults(kbId, detailRunId, {
    page: detailPage,
    pageSize: RESULT_PAGE_SIZE,
    errorOnly,
  });

  /** 打开下拉时重置名称，避免沿用上一次的。 */
  const toggleConfig = () => {
    setError('');
    if (!configOpen) {
      setName(buildDefaultEvaluationName());
      setDatasetId((current) => current || (available[0]?.dataset_id ?? ''));
    }
    setConfigOpen((current) => !current);
  };

  const selectedDataset: EvaluationDataset | undefined = available.find(
    (item) => item.dataset_id === datasetId,
  );

  const submit = async () => {
    const invalid = validateEvaluationStart({
      datasetId,
      name,
      hasGoldAnswers: Boolean(selectedDataset?.has_gold_answers),
      answerLlm,
      judgeLlm,
    });
    if (invalid) {
      setError(invalid);
      return;
    }
    try {
      await start.mutateAsync({
        dataset_id: datasetId,
        name: name.trim(),
        model_config: {
          answer_llm: answerLlm.trim(),
          judge_llm: judgeLlm.trim(),
        },
      });
      setConfigOpen(false);
      notifications.addNotification({
        type: 'success',
        title: 'RAG 评估',
        message: '评估任务已开始。',
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '启动评估失败。',
      );
    }
  };

  const runDelete = async (run: EvaluationRun) => {
    const confirmed = await confirm({
      title: '确定要删除这条评估记录吗？',
      description: '删除后将无法恢复。',
      confirmText: '确定',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await remove.mutateAsync(run.run_id);
      notifications.addNotification({
        type: 'success',
        title: 'RAG 评估',
        message: '删除成功。',
      });
    } catch (deleteError) {
      notifications.addNotification({
        type: 'error',
        title: 'RAG 评估',
        message:
          deleteError instanceof Error
            ? deleteError.message
            : '删除评估记录失败。',
      });
    }
  };

  /*
   * 切回分区时重取基准与历史：面板被 antd 常驻（切走不卸载），应用的查询客户端又关掉了
   * 窗口聚焦重取、`staleTime` 是 60 秒——从「评估基准」页签回来常常看到旧数据。
   */
  const firstActivation = React.useRef(true);
  React.useEffect(() => {
    if (firstActivation.current) {
      firstActivation.current = false;
      return;
    }
    if (!active) return;
    void queryClient.invalidateQueries({
      queryKey: evaluationKeys.datasets(kbId),
    });
    void queryClient.invalidateQueries({ queryKey: evaluationKeys.runs(kbId) });
  }, [active, kbId, queryClient]);

  if (runs.isLoading || datasets.isLoading) {
    return (
      <PanelStateBox>
        <p className="flex items-center gap-2 text-sm text-color-text-2">
          <Spin />
          加载中…
        </p>
      </PanelStateBox>
    );
  }

  // 两个查询各自失败各有各的说法：历史挂了说历史，基准挂了说基准——不能都落进
  // 「暂无可用评估基准」的空态（那会把加载失败说成「没有基准」）
  const failedQuery = runs.isError
    ? { label: '加载评估历史失败', retry: () => void runs.refetch() }
    : datasets.isError
      ? { label: '加载评估基准失败', retry: () => void datasets.refetch() }
      : null;

  if (failedQuery) {
    const error = runs.isError ? runs.error : datasets.error;
    return (
      <PanelStateBox>
        <p role="alert" className="text-sm text-danger-6">
          {failedQuery.label}：
          {error instanceof Error ? error.message : '未知错误'}
        </p>
        <Button
          htmlType="button"
          variant="outlined"
          onClick={failedQuery.retry}
        >
          <RefreshCw className="size-4" />
          重试
        </Button>
      </PanelStateBox>
    );
  }

  if (available.length === 0) {
    return (
      <PanelStateBox>
        <SharedEmpty
          description="先上传或生成评估基准，再运行 RAG 评估。"
          action={
            <Button htmlType="button" onClick={onGoToBenchmarks}>
              前往基准管理
            </Button>
          }
        />
      </PanelStateBox>
    );
  }

  const rows = runs.data ?? [];
  const latest = latestRun(rows);
  const historyTotalPages = Math.max(
    1,
    Math.ceil(rows.length / HISTORY_PAGE_SIZE),
  );
  const historyRows = rows.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE,
  );
  const modelGroups = Object.values(models.data ?? {});
  const hint = evaluationStartHint({
    hasGoldAnswers: Boolean(selectedDataset?.has_gold_answers),
    answerLlm,
    judgeLlm,
  });
  const detailItems = detail.data?.items ?? [];
  const detailPages = detail.data?.pagination?.total_pages ?? 0;

  const renderModelSelect = (
    label: string,
    value: string,
    onChange: (next: string) => void,
    disabled: boolean,
  ) => (
    <div className="flex flex-col gap-1 text-xs text-color-text-2">
      <span>{label}</span>
      <Select
        value={value || undefined}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
        virtual={false}
        options={modelGroups.flatMap((group) =>
          group.models.map((model) => ({
            value: model.spec,
            label: `${group.provider_display_name} · ${model.display_name || model.model_id}`,
          })),
        )}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-color-text-2">
          共 {rows.length} 次评估记录
        </span>
        <div className="flex gap-2">
          <Button
            htmlType="button"
            variant="outlined"
            onClick={() => void runs.refetch()}
          >
            <RefreshCw className="size-4" />
            刷新
          </Button>
          {readOnly ? null : (
            <Button htmlType="button" onClick={toggleConfig}>
              <Play className="size-4" />
              新建评估
            </Button>
          )}
        </div>
      </div>

      {configOpen && !readOnly ? (
        <section
          aria-label="启动评估"
          className="flex flex-col gap-3 rounded-large border border-color-border-1 px-3 py-3"
        >
          <div className="flex flex-col gap-1 text-xs text-color-text-2">
            <label htmlFor="evaluation-name">评估名称</label>
            <Input
              id="evaluation-name"
              maxLength={100}
              value={name}
              onChange={(event) => {
                setError('');
                setName(event.target.value);
              }}
            />
          </div>

          <div className="flex flex-col gap-1 text-xs text-color-text-2">
            <span>评估基准</span>
            <Select
              value={datasetId}
              onChange={(value) => {
                setError('');
                setDatasetId(value);
                const next = available.find(
                  (item) => item.dataset_id === value,
                );
                if (!next?.has_gold_answers) {
                  setAnswerLlm('');
                  setJudgeLlm('');
                }
              }}
              aria-label="评估基准"
              placeholder="选择评估基准"
              virtual={false}
              options={available.map((item) => ({
                value: item.dataset_id,
                label: `${item.name} (${item.item_count} 个问题)`,
              }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {renderModelSelect(
              '答案生成模型',
              answerLlm,
              (value) => {
                setError('');
                setAnswerLlm(value);
              },
              !selectedDataset?.has_gold_answers,
            )}
            {renderModelSelect(
              '答案评判模型',
              judgeLlm,
              (value) => {
                setError('');
                setJudgeLlm(value);
              },
              !selectedDataset?.has_gold_answers,
            )}
          </div>

          <p className="text-xs text-color-text-3">{hint}</p>
          {error ? (
            <p role="alert" className="text-xs text-danger-6">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              htmlType="button"
              variant="outlined"
              disabled={start.isPending}
              onClick={() => setConfigOpen(false)}
            >
              取消
            </Button>
            <Button
              htmlType="button"
              disabled={start.isPending}
              onClick={() => void submit()}
            >
              {start.isPending ? <Spin /> : <Play className="size-4" />}
              开始评估
            </Button>
          </div>
        </section>
      ) : null}

      {latest ? (
        <section
          aria-label="最近一次评估"
          className="flex flex-col gap-3 rounded-large border border-color-border-1 px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-4">
            <ScoreRing
              score={
                typeof latest.overall_score === 'number'
                  ? latest.overall_score
                  : null
              }
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-color-text-1">
                {latest.name}
              </span>
              <span className="text-xs text-color-text-3">
                {runStatusView(latest.status).label} ·{' '}
                {datasetNameOf(latest.dataset_id, datasets.data)} ·{' '}
                {runDuration(latest)} · Run {latest.run_id}
              </span>
            </div>
          </div>

          {latest.status === 'running' ? (
            <Progress
              value={runProgress(latest)}
              label={runProgressMessage(latest)}
            />
          ) : null}

          <div className="grid grid-cols-4 gap-2">
            {[
              {
                label: 'Recall@10',
                value: latest.metrics?.['recall@10'],
                percent: true,
              },
              { label: '耗时', value: runDuration(latest), percent: false },
              {
                label: '数据量',
                value: `${latest.completed_items}/${latest.total_items}`,
                percent: false,
              },
              {
                label: '完成率',
                value:
                  runCompletion(latest) === null
                    ? '-'
                    : `${runCompletion(latest)}%`,
                percent: false,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex flex-col rounded border border-color-border-1 px-2 py-1"
              >
                <span className="text-sm text-color-text-1">
                  {item.label === 'Recall@10' ? (
                    // 检索指标给三位小数（`0.900`），不是百分比
                    <MetricValue
                      value={item.value}
                      placeholder={metricPlaceholder(latest.status)}
                    />
                  ) : (
                    item.value
                  )}
                </span>
                <span className="text-xs text-color-text-3">{item.label}</span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="flex h-[160px] flex-col items-center justify-center gap-1 rounded-large border border-color-border-1">
          <p className="text-sm font-medium text-color-text-1">暂无评估记录</p>
          <p className="text-sm text-color-text-3">
            开始评估后会在这里展示最近一次结果。
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="overflow-x-auto rounded-large border border-color-border-1">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-color-text-3">
              <tr className="border-b border-color-border-1">
                <th className="px-3 py-2">评估名称</th>
                <th className="px-3 py-2">评估基准</th>
                <th className="px-3 py-2">数据量</th>
                <th className="px-3 py-2">耗时</th>
                <th className="px-3 py-2">Recall@10</th>
                <th className="px-3 py-2">综合评分</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((run) => (
                <tr
                  key={run.run_id}
                  className="border-b border-color-border-1 last:border-0"
                >
                  <td className="px-3 py-2 text-color-text-1">{run.name}</td>
                  <td className="px-3 py-2 text-color-text-2">
                    {datasetNameOf(run.dataset_id, datasets.data)}
                  </td>
                  <td className="px-3 py-2 text-color-text-2">
                    {run.completed_items}/{run.total_items}
                  </td>
                  <td className="px-3 py-2 text-color-text-2">
                    {runDuration(run)}
                  </td>
                  <td className="px-3 py-2">
                    <MetricValue
                      value={run.metrics?.['recall@10']}
                      placeholder={metricPlaceholder(run.status)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <MetricValue
                      value={run.overall_score}
                      digits={0}
                      placeholder={metricPlaceholder(run.status)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${runStatusView(run.status).className}`}
                    >
                      {runStatusView(run.status).label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <Button
                        htmlType="button"
                        variant="text"
                        size="small"
                        onClick={() => {
                          setDetailRunId(run.run_id);
                          setDetailPage(1);
                          setErrorOnly(false);
                        }}
                      >
                        查看
                      </Button>
                      {readOnly ? null : (
                        <Dropdown
                          trigger={['click']}
                          menu={{
                            items: [
                              {
                                key: 'delete',
                                label: (
                                  <span className="flex items-center gap-2">
                                    <Trash2 className="size-4" />
                                    删除
                                  </span>
                                ),
                                danger: true,
                              },
                            ],
                            onClick: ({ key }) => {
                              if (key === 'delete') void runDelete(run);
                            },
                          }}
                        >
                          <Button
                            htmlType="button"
                            type="text"
                            size="small"
                            aria-label={`${run.name} 操作`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </Dropdown>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {historyRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-color-text-3"
                  >
                    还没有评估记录。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-xs text-color-text-3">
          <span>
            第 {historyPage} / {historyTotalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              htmlType="button"
              variant="outlined"
              size="small"
              disabled={historyPage <= 1}
              onClick={() =>
                setHistoryPage((current) => Math.max(1, current - 1))
              }
            >
              <ChevronLeft className="size-4" />
              上一页
            </Button>
            <Button
              htmlType="button"
              variant="outlined"
              size="small"
              disabled={historyPage >= historyTotalPages}
              onClick={() => setHistoryPage((current) => current + 1)}
            >
              下一页
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {detailRunId ? (
        <section
          aria-label="评估结果"
          className="flex flex-col gap-3 rounded-large border border-color-border-1 px-3 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-color-text-1">
                {detail.data?.name ?? detailRunId}
              </span>
              <span className="text-xs text-color-text-3">
                {detail.data
                  ? `${runStatusView(detail.data.status).label} · 综合评分 ${formatPercent(
                      detail.data.overall_score,
                    )} · 完成 ${detail.data.completed_items ?? 0}/${
                      detail.data.total_items ?? 0
                    } · 耗时 ${runDuration({
                      status: detail.data.status,
                      started_at: detail.data.started_at ?? null,
                      completed_at: detail.data.completed_at ?? null,
                    })}`
                  : '加载中…'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                htmlType="button"
                variant="outlined"
                size="small"
                onClick={() => {
                  setErrorOnly((current) => !current);
                  setDetailPage(1);
                }}
              >
                {errorOnly ? '显示全部' : '仅查看错误'}
              </Button>
              <Button
                htmlType="button"
                variant="outlined"
                size="small"
                onClick={() => setDetailRunId(null)}
              >
                关闭
              </Button>
            </div>
          </div>

          {detail.isLoading ? (
            <div className="flex h-[200px] items-center justify-center gap-2 text-sm text-color-text-2">
              <Spin />
              加载中…
            </div>
          ) : detail.isError ? (
            <p role="alert" className="text-sm text-danger-6">
              加载评估结果失败：
              {detail.error instanceof Error
                ? detail.error.message
                : '未知错误'}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-2 py-2">
                {detailItems.map((item, index) => {
                  const score = answerScore(item);
                  return (
                    <li
                      key={`${item.query}-${index}`}
                      className="flex flex-col gap-1 rounded border border-color-border-1 px-3 py-2"
                    >
                      <span className="text-sm text-color-text-1">
                        {item.query}
                      </span>
                      {item.generated_answer ? (
                        <span className="text-xs text-color-text-2">
                          生成答案：{item.generated_answer}
                        </span>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {retrievalMetricEntries(item.metrics).map((entry) => (
                          <span key={entry.key} className="text-color-text-3">
                            {entry.label}: <MetricValue value={entry.value} />
                          </span>
                        ))}
                        <span className="text-color-text-3">
                          答案评判：
                          <span
                            className={
                              score === null
                                ? 'text-color-text-3'
                                : TONE_TEXT[score > 0.5 ? 'success' : 'danger']
                            }
                          >
                            {answerVerdict(score)}
                          </span>
                        </span>
                        {/* 评判理由：后端给的是模型为什么这么判，长文本用 title 兜底 */}
                        {typeof item.metrics?.reasoning === 'string' &&
                        item.metrics.reasoning ? (
                          <span
                            className="min-w-0 truncate text-color-text-3"
                            title={item.metrics.reasoning}
                          >
                            理由：{item.metrics.reasoning}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
                {detailItems.length === 0 ? (
                  <li className="py-6 text-center text-sm text-color-text-3">
                    {errorOnly ? '没有失败的结果。' : '暂无详细结果数据。'}
                  </li>
                ) : null}
              </ul>

              <div className="flex items-center justify-between text-xs text-color-text-3">
                <span>
                  共 {detail.data?.pagination?.total ?? 0} 条
                  {errorOnly ? '（仅失败）' : ''}
                </span>
                <div className="flex gap-2">
                  <Button
                    htmlType="button"
                    variant="outlined"
                    size="small"
                    disabled={detailPage <= 1 || detail.isFetching}
                    onClick={() =>
                      setDetailPage((current) => Math.max(1, current - 1))
                    }
                  >
                    上一页
                  </Button>
                  <Button
                    htmlType="button"
                    variant="outlined"
                    size="small"
                    disabled={detailPage >= detailPages || detail.isFetching}
                    onClick={() => setDetailPage((current) => current + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
};

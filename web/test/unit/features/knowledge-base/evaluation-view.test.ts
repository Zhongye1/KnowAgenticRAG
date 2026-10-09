/**
 * 评估视图纯逻辑：状态标签、数据集标签、进度、指标格式化与错误判定。
 */
import { describe, expect, it } from 'vitest';

import type { EvaluationRunItem } from '@/features/knowledge-base/api/evaluation-api';
import {
  answerScore,
  datasetNameOf,
  evaluableDatasets,
  latestRun,
  runCompletion,
  runDuration,
  answerVerdict,
  canPreviewDataset,
  datasetKindLabel,
  datasetProgress,
  datasetSourceLabel,
  datasetStatusMessage,
  datasetStatusView,
  formatMetricValue,
  formatPercent,
  isDatasetCompleted,
  isDatasetGenerating,
  isErrorRunItem,
  metricShortName,
  metricTone,
  retrievalMetricEntries,
  runProgress,
  runProgressMessage,
  runStatusView,
} from '@/features/knowledge-base/lib/evaluation-view';

describe('数据集状态', () => {
  it('四种状态各有文案与配色，缺省按已完成', () => {
    expect(datasetStatusView({ status: 'pending' })).toMatchObject({
      label: '等待生成',
    });
    expect(datasetStatusView({ status: 'running' }).label).toBe('生成中');
    expect(datasetStatusView({ status: 'failed' }).label).toBe('生成失败');
    expect(datasetStatusView({ status: 'completed' }).label).toBe('已完成');
    expect(datasetStatusView(null).label).toBe('已完成');
    expect(datasetStatusView({}).label).toBe('已完成');
  });

  it('只有 pending/running 算生成中：进度条与轮询都看它', () => {
    expect(isDatasetGenerating({ status: 'pending' })).toBe(true);
    expect(isDatasetGenerating({ status: 'running' })).toBe(true);
    expect(isDatasetGenerating({ status: 'failed' })).toBe(false);
    expect(isDatasetGenerating(undefined)).toBe(false);
  });

  it('完成与失败都能预览，只有完成能跑评估', () => {
    expect(canPreviewDataset({ status: 'completed' })).toBe(true);
    expect(canPreviewDataset({ status: 'failed' })).toBe(true);
    expect(canPreviewDataset({ status: 'running' })).toBe(false);
    expect(isDatasetCompleted({ status: 'completed' })).toBe(true);
    expect(isDatasetCompleted({ status: 'failed' })).toBe(false);
  });

  it('进度只在自己生成中且数值合法时给；越界夹到 0..100', () => {
    expect(datasetProgress({ status: 'running', progress: 42.6 })).toBe(43);
    expect(datasetProgress({ status: 'running', progress: 400 })).toBe(100);
    expect(datasetProgress({ status: 'running', progress: -5 })).toBe(0);
    expect(datasetProgress({ status: 'running' })).toBeNull();
    expect(datasetProgress({ status: 'completed', progress: 100 })).toBeNull();
  });

  it('状态说明优先失败原因，其次后端消息，最后状态标签', () => {
    expect(
      datasetStatusMessage({ status: 'failed', error_message: '模型超时' }),
    ).toBe('模型超时');
    expect(
      datasetStatusMessage({ status: 'running', message: '生成中 3/10' }),
    ).toBe('生成中 3/10');
    expect(datasetStatusMessage({ status: 'failed' })).toBe('生成失败');
  });

  it('类型标签区分检索/问答/仅查询', () => {
    expect(
      datasetKindLabel({ has_gold_chunks: true, has_gold_answers: false }),
    ).toBe('检索评估');
    expect(
      datasetKindLabel({ has_gold_chunks: false, has_gold_answers: true }),
    ).toBe('问答评估');
    expect(
      datasetKindLabel({ has_gold_chunks: false, has_gold_answers: false }),
    ).toBe('仅查询');
    expect(
      datasetKindLabel({ has_gold_chunks: true, has_gold_answers: true }),
    ).toBe('检索 + 问答');
  });

  it('来源按 build_metadata.source 判', () => {
    expect(datasetSourceLabel({ source: 'generated' })).toBe('自动生成');
    expect(datasetSourceLabel({})).toBe('上传');
    expect(datasetSourceLabel(null)).toBe('上传');
  });
});

describe('运行状态与进度', () => {
  it('四种状态文案与未知兜底', () => {
    expect(runStatusView('running').label).toBe('运行中');
    expect(runStatusView('completed').label).toBe('已完成');
    expect(runStatusView('failed').label).toBe('失败');
    expect(runStatusView('paused').label).toBe('已暂停');
    expect(runStatusView('weird').label).toBe('weird');
    expect(runStatusView(null).label).toBe('未知');
  });

  it('进度优先用任务给的 progress，否则按完成条数推算', () => {
    expect(
      runProgress({ progress: 33.3, completed_items: 1, total_items: 10 }),
    ).toBe(33);
    expect(runProgress({ completed_items: 5, total_items: 20 })).toBe(25);
    // `progress: null` 是「没有进度信息」，不能被 Number(null) 当成 0
    expect(
      runProgress({ progress: null, completed_items: 5, total_items: 20 }),
    ).toBe(25);
    expect(runProgress({ completed_items: 0, total_items: 0 })).toBeNull();
  });

  it('进度文案：后端消息 → 评估 c/t → 进行中', () => {
    expect(
      runProgressMessage({
        message: '评估进行中',
        completed_items: 1,
        total_items: 2,
      }),
    ).toBe('评估进行中');
    expect(runProgressMessage({ completed_items: 3, total_items: 10 })).toBe(
      '评估 3/10',
    );
    expect(runProgressMessage({ completed_items: 0, total_items: 0 })).toBe(
      '评估进行中',
    );
  });
});

describe('耗时、完成率与数据集投影', () => {
  const run = (extra: Record<string, unknown> = {}) => ({
    run_id: 'run_1',
    name: 'eval',
    dataset_id: 'ds-1',
    status: 'completed',
    started_at: '2026-10-09T02:00:00Z',
    completed_at: '2026-10-09T02:00:12.300Z',
    total_items: 10,
    completed_items: 10,
    metrics: {},
    ...extra,
  });

  it('耗时：跑完算差值，运行中显示进行中，缺时间给 -', () => {
    expect(runDuration(run())).toBe('12.3s');
    expect(runDuration(run({ status: 'running', completed_at: null }))).toBe(
      '进行中',
    );
    expect(runDuration(run({ started_at: null }))).toBe('-');
    expect(
      runDuration(
        run({
          started_at: '2026-10-09T02:00:00Z',
          completed_at: '2026-10-09T02:03:05Z',
        }),
      ),
    ).toBe('3m 5s');
  });

  it('完成率：总数为 0 时不给值，否则四舍五入', () => {
    expect(runCompletion(run())).toBe(100);
    expect(runCompletion(run({ completed_items: 3 }))).toBe(30);
    expect(runCompletion(run({ total_items: 0 }))).toBeNull();
  });

  it('最近一次取列表第一条，空列表给 null', () => {
    expect(latestRun([run(), run({ run_id: 'run_2' })])?.run_id).toBe('run_1');
    expect(latestRun([])).toBeNull();
    expect(latestRun(undefined)).toBeNull();
  });

  it('数据集名投影：找不到就回落 id', () => {
    const datasets = [{ dataset_id: 'ds-1', name: '基准甲' }];
    expect(datasetNameOf('ds-1', datasets)).toBe('基准甲');
    expect(datasetNameOf('ds-9', datasets)).toBe('ds-9');
    expect(datasetNameOf('ds-9', null)).toBe('ds-9');
  });

  it('只有生成完成的数据集才可选来跑评估', () => {
    const list: Array<{
      dataset_id: string;
      build_metadata?: { status: 'completed' | 'running' | 'failed' } | null;
    }> = [
      { dataset_id: 'a', build_metadata: { status: 'completed' } },
      { dataset_id: 'b', build_metadata: { status: 'running' } },
      { dataset_id: 'c', build_metadata: { status: 'failed' } },
      { dataset_id: 'd' },
    ];

    expect(evaluableDatasets(list).map((item) => item.dataset_id)).toEqual([
      'a',
      'd',
    ]);
  });
});

describe('指标格式化', () => {
  it('百分比一位小数，非法值给 -', () => {
    expect(formatPercent(0.9123)).toBe('91.2%');
    expect(formatPercent(0.9123, 2)).toBe('91.23%');
    expect(formatPercent(null)).toBe('-');
    expect(formatPercent('abc')).toBe('-');
  });

  it('指标值三位小数', () => {
    expect(formatMetricValue(0.91234)).toBe('0.912');
    expect(formatMetricValue(1)).toBe('1.000');
    expect(formatMetricValue(undefined)).toBe('-');
  });

  it('阈值：0.8 好、0.6 警告、其余差；非数字不给色', () => {
    expect(metricTone(0.8)).toBe('success');
    expect(metricTone(0.79)).toBe('warning');
    expect(metricTone(0.6)).toBe('warning');
    expect(metricTone(0.59)).toBe('danger');
    expect(metricTone(null)).toBeNull();
  });

  it('指标短名：recall@k → R@k，未知键原样', () => {
    expect(metricShortName('recall@10')).toBe('R@10');
    expect(metricShortName('f1@5')).toBe('F1@5');
    expect(metricShortName('precision@10')).toBe('P@10');
    expect(metricShortName('ndcg@10')).toBe('NDCG@10');
    expect(metricShortName('answer_correctness')).toBe('answer_correctness');
  });

  it('检索指标按固定顺序输出，且把 f1@k 一并显示（上游漏了它）', () => {
    const entries = retrievalMetricEntries({
      'f1@10': 0.5,
      'recall@10': 0.9,
      'recall@1': 0.3,
      score: 1,
    });

    expect(entries.map((entry) => entry.key)).toEqual([
      'recall@1',
      'recall@10',
      'f1@10',
    ]);
    expect(entries[0]).toMatchObject({ label: 'R@1', value: 0.3 });
  });

  it('非数字指标不进列表', () => {
    expect(retrievalMetricEntries({ 'recall@1': Number.NaN })).toEqual([]);
    expect(retrievalMetricEntries(null)).toEqual([]);
  });
});

describe('错误结果判定', () => {
  const item = (metrics: Record<string, number>): EvaluationRunItem => ({
    query: '问',
    metrics,
  });

  it('与后端同口径：得分 ≤0.5 或任一 recall@k < 0.3', () => {
    expect(isErrorRunItem(item({ score: 0.4 }))).toBe(true);
    expect(isErrorRunItem(item({ score: 0.5 }))).toBe(true);
    expect(isErrorRunItem(item({ score: 0.9, 'recall@10': 0.2 }))).toBe(true);
    expect(isErrorRunItem(item({ score: 0.9, 'recall@10': 0.5 }))).toBe(false);
    expect(isErrorRunItem(item({}))).toBe(false);
  });

  it('只有后端给了 score 才算评判过', () => {
    expect(answerScore(item({ score: 1 }))).toBe(1);
    expect(answerScore(item({}))).toBeNull();
    expect(answerVerdict(1)).toBe('正确');
    expect(answerVerdict(0.2)).toBe('错误');
    expect(answerVerdict(null)).toBe('未评判');
  });
});

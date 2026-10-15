/**
 * 图谱构建面板纯逻辑：状态标签、主操作分支、九个统计格、配置管理入口的出现条件。
 */
import { describe, expect, it } from 'vitest';

import type { GraphBuildStatus } from '@/features/knowledge-base/api/graph-api';
import {
  canManageGraphBuildConfig,
  graphBuildStateView,
  graphBuildAction,
  graphBuildStateTag,
  graphBuildStats,
  graphIndexDot,
  graphIndexTitle,
  hasPendingGraphChunks,
} from '@/features/knowledge-base/lib/graph-build';

const status = (extra: Partial<GraphBuildStatus> = {}): GraphBuildStatus => ({
  kb_id: 'kb-1',
  kb_type: 'milvus',
  configured: true,
  locked: true,
  config: null,
  total_chunks: 10,
  pending_chunks: 4,
  indexed_chunks: 6,
  structured_chunks: 5,
  extraction_counts: { pending: 0, succeeded: 6, failed: 0 },
  vector_counts: { pending: 1, processing: 2, indexed: 3, failed: 0 },
  entity_count: 12,
  relationship_count: 7,
  build_task_status: null,
  build_task_progress: 0,
  ...extra,
});

describe('状态标签', () => {
  it('按任务状态与锁定态给出五种标签', () => {
    expect(
      graphBuildStateTag(status({ build_task_status: 'running' })),
    ).toEqual({
      label: '构建中',
      tone: 'info',
    });
    expect(
      graphBuildStateTag(status({ build_task_status: 'pending' })).label,
    ).toBe('构建中');
    expect(graphBuildStateTag(status({ build_task_status: 'failed' }))).toEqual(
      {
        label: '执行异常',
        tone: 'danger',
      },
    );
    expect(
      graphBuildStateTag(status({ build_task_status: 'completed' })).label,
    ).toBe('执行完成');
    expect(graphBuildStateTag(status()).label).toBe('已配置');
    expect(graphBuildStateTag(status({ locked: false })).label).toBe('未配置');
    expect(graphBuildStateTag(undefined).label).toBe('未配置');
  });
});

describe('状态标签的展示类', () => {
  it('四种 tone 各自映射到语义 Token 类，不出现默认调色板', () => {
    const classes = [
      graphBuildStateView(status({ build_task_status: 'running' })).className,
      graphBuildStateView(status({ build_task_status: 'failed' })).className,
      graphBuildStateView(status({ build_task_status: 'completed' })).className,
      graphBuildStateView(status({ locked: false })).className,
    ];

    expect(classes).toEqual([
      'bg-primary-6/10 text-primary-6',
      'bg-danger-6/10 text-danger-6',
      'bg-success-6/10 text-success-6',
      'bg-warning-6/10 text-warning-6',
    ]);
  });
});

describe('主操作按钮', () => {
  it('没锁定配置时先让配置抽取器', () => {
    expect(graphBuildAction(status({ locked: false }))).toEqual({
      kind: 'configure',
      label: '配置抽取器',
      disabled: false,
    });
  });

  it('构建中显示进度且点不动', () => {
    expect(
      graphBuildAction(
        status({ build_task_status: 'running', build_task_progress: 42.6 }),
      ),
    ).toEqual({ kind: 'building', label: '构建中 43%', disabled: true });
  });

  it('有失败向量时优先重试向量，且不受待构建 Chunk 为 0 的影响', () => {
    expect(
      graphBuildAction(
        status({
          build_task_status: 'failed',
          pending_chunks: 0,
          vector_counts: { pending: 0, processing: 0, indexed: 1, failed: 2 },
        }),
      ),
    ).toEqual({
      kind: 'retry-vectors',
      label: '重试失败向量',
      disabled: false,
    });
  });

  it('执行异常且没有失败向量时重试索引，没有待构建 Chunk 才禁用', () => {
    expect(
      graphBuildAction(status({ build_task_status: 'failed' })),
    ).toMatchObject({ kind: 'retry-index', disabled: false });
    expect(
      graphBuildAction(
        status({ build_task_status: 'failed', pending_chunks: 0 }),
      ),
    ).toMatchObject({ kind: 'retry-index', disabled: true });
  });

  it('其余情况是开始索引，没有待构建 Chunk 时禁用', () => {
    expect(graphBuildAction(status())).toMatchObject({
      kind: 'index',
      disabled: false,
    });
    expect(graphBuildAction(status({ pending_chunks: 0 }))).toMatchObject({
      kind: 'index',
      disabled: true,
    });
  });
});

describe('统计格', () => {
  it('向量待处理把 pending 与 processing 相加，抽取失败可点', () => {
    const stats = graphBuildStats(
      status({
        extraction_counts: { pending: 1, succeeded: 5, failed: 3 },
        vector_counts: { pending: 1, processing: 2, indexed: 3, failed: 4 },
      }),
    );

    const byKey = Object.fromEntries(stats.map((item) => [item.key, item]));
    expect(byKey['vector-pending'].value).toBe(3);
    expect(byKey['vector-failed'].value).toBe(4);
    // 向量失败没有样例接口，不给可点入口
    expect(byKey['vector-failed'].clickable).toBeUndefined();
    expect(byKey['extraction-failed'].value).toBe(3);
    expect(byKey['extraction-failed'].clickable).toBe(true);
    expect(byKey.entities.value).toBe(12);
    expect(stats).toHaveLength(9);
  });

  it('没有状态时九格都在但值为空', () => {
    const stats = graphBuildStats(undefined);

    expect(stats).toHaveLength(9);
    expect(stats.every((item) => item.value === null)).toBe(true);
    expect(stats.some((item) => item.clickable)).toBe(false);
  });

  it('失败数为 0 时不可点（不给无内容的入口）', () => {
    const stats = graphBuildStats(status());

    expect(
      stats.find((item) => item.key === 'extraction-failed')?.clickable,
    ).toBe(false);
    // 向量失败永远不给可点入口（没有对应的样例接口）
    expect(
      stats.find((item) => item.key === 'vector-failed')?.clickable,
    ).toBeUndefined();
  });
});

describe('配置管理入口与索引前提', () => {
  it('已锁定且没有任务在跑时才给修改配置与重置', () => {
    expect(canManageGraphBuildConfig(status())).toBe(true);
    expect(
      canManageGraphBuildConfig(status({ build_task_status: 'running' })),
    ).toBe(false);
    expect(canManageGraphBuildConfig(status({ locked: false }))).toBe(false);
    expect(canManageGraphBuildConfig(undefined)).toBe(false);
  });

  it('有待构建 Chunk 才算有索引前提', () => {
    expect(hasPendingGraphChunks(status())).toBe(true);
    expect(hasPendingGraphChunks(status({ pending_chunks: 0 }))).toBe(false);
    expect(hasPendingGraphChunks(undefined)).toBe(false);
  });
});

describe('索引按钮的状态角标', () => {
  it('构建中优先，其次待索引，再是已全部索引', () => {
    expect(
      graphIndexDot(
        status({ build_task_status: 'running', pending_chunks: 2 }),
      ),
    ).toBe('active');
    expect(graphIndexDot(status({ pending_chunks: 2 }))).toBe('pending');
    expect(graphIndexDot(status({ pending_chunks: 0 }))).toBe('complete');
  });

  it('既没锁定也没待索引时不给角标', () => {
    expect(graphIndexDot(status({ locked: false, pending_chunks: 0 }))).toBe(
      '',
    );
    expect(graphIndexDot(undefined)).toBe('');
  });

  it('状态写进 title，待索引条数优先于「索引中」', () => {
    expect(graphIndexTitle(status({ pending_chunks: 4 }))).toBe(
      '索引管理，4 待索引',
    );
    expect(graphIndexTitle(status({ pending_chunks: 0 }))).toBe(
      '索引管理，已全部索引',
    );
    // 构建中但还有待索引的 Chunk：文案仍以待索引优先
    expect(
      graphIndexTitle(
        status({ build_task_status: 'running', pending_chunks: 3 }),
      ),
    ).toBe('索引管理，3 待索引');
    expect(
      graphIndexTitle(
        status({ build_task_status: 'running', pending_chunks: 0 }),
      ),
    ).toBe('索引管理，索引中');
    expect(graphIndexTitle(status({ locked: false, pending_chunks: 0 }))).toBe(
      '索引管理',
    );
  });
});

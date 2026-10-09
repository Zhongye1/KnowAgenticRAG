/**
 * 图谱索引管理面板：状态、进度、九个统计格与操作按钮。
 *
 * 移植上游 `KnowledgeGraphSection.vue` 的「索引管理」浮动面板。判定逻辑全在
 * `lib/graph-build.ts`（可单测），这里只负责把结论渲染出来并回调；重置的二次确认、
 * 配置弹窗与失败样例弹窗由调用方提供，面板本身不弹窗。
 *
 * 只在「文档型知识库 + 可管理 + 用户打开了面板」时由调用方渲染，因此没有只读分支。
 */
import { Database, RefreshCw } from 'lucide-react';

import type { GraphBuildStatus } from '../api/graph-api';
import {
  canManageGraphBuildConfig,
  graphBuildAction,
  graphBuildStateView,
  graphBuildStats,
  isGraphBuildRunning,
  type GraphBuildAction,
} from '../lib/graph-build';
import { Button } from '@/shared/ui/button';
import { Progress } from '@/shared/ui/progress';

export type GraphBuildPanelProps = {
  status?: GraphBuildStatus | null;
  /** 状态请求在飞行中（刷新按钮转圈）。 */
  loading?: boolean;
  /** 写操作在飞行中：所有按钮点不动。 */
  busy?: boolean;
  onRefresh: () => void;
  onConfigure: () => void;
  onIndex: () => void;
  onRetryVectors: () => void;
  onReset: () => void;
  onOpenFailedChunks: () => void;
};

const ACTION_HANDLERS: Record<
  GraphBuildAction['kind'],
  'onConfigure' | 'onIndex' | 'onRetryVectors'
> = {
  configure: 'onConfigure',
  building: 'onIndex',
  'retry-index': 'onIndex',
  'retry-vectors': 'onRetryVectors',
  index: 'onIndex',
};

export const GraphBuildPanel = ({
  status,
  loading = false,
  busy = false,
  onRefresh,
  onConfigure,
  onIndex,
  onRetryVectors,
  onReset,
  onOpenFailedChunks,
}: GraphBuildPanelProps) => {
  const state = graphBuildStateView(status);
  const action = graphBuildAction(status);
  const stats = graphBuildStats(status);
  const running = isGraphBuildRunning(status);
  const progress = Math.round(status?.build_task_progress ?? 0);
  const handlers = { onConfigure, onIndex, onRetryVectors };

  return (
    <section
      aria-label="图谱索引管理"
      className="absolute right-2.5 top-14 flex max-h-[calc(100%-4.5rem)] w-[320px] flex-col overflow-hidden rounded-large border border-color-border-1 bg-color-bg-1 shadow-lg"
    >
      <header className="flex items-center justify-between border-b border-color-border-1 px-3 py-2">
        <span className="text-sm font-medium text-color-text-1">索引管理</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="刷新图谱构建状态"
          className="size-6"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw
            className={loading ? 'size-3.5 animate-spin' : 'size-3.5'}
          />
        </Button>
      </header>

      <div className="flex flex-col gap-3 overflow-y-auto px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-color-text-3">状态</span>
          <span
            data-testid="graph-build-state"
            className={`rounded px-1.5 py-0.5 text-xs ${state.className}`}
          >
            {state.label}
          </span>
        </div>

        {running ? <Progress value={progress} label="图谱构建进度" /> : null}

        <div className="grid grid-cols-3 gap-2">
          {stats.map((stat) =>
            stat.clickable ? (
              <button
                key={stat.key}
                type="button"
                className="flex flex-col items-start rounded border border-color-border-1 px-2 py-1 text-left hover:bg-color-fill-1"
                onClick={onOpenFailedChunks}
              >
                <span className="text-sm text-color-text-1">{stat.value}</span>
                <span className="text-xs text-color-text-3">{stat.label}</span>
              </button>
            ) : (
              <div
                key={stat.key}
                className="flex flex-col items-start rounded border border-color-border-1 px-2 py-1"
              >
                <span className="text-sm text-color-text-1">
                  {stat.value ?? '-'}
                </span>
                <span className="text-xs text-color-text-3">{stat.label}</span>
              </div>
            ),
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Button
            type="button"
            className="w-full"
            disabled={action.disabled || busy || action.kind === 'building'}
            onClick={handlers[ACTION_HANDLERS[action.kind]]}
          >
            <Database className="size-4" />
            {action.label}
          </Button>
          {canManageGraphBuildConfig(status) ? (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={onConfigure}
              >
                修改配置
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger-6"
                disabled={busy}
                onClick={onReset}
              >
                重置
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

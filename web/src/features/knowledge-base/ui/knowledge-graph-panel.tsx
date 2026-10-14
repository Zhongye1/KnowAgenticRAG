/**
 * 知识图谱分区：搜索与设置工具栏、画布、空态、详情面板与两个弹窗的组装。
 *
 * - 搜索与「设置」改的是本地参数，点「应用 / 回车」才落到查询参数上。
 * - 搜索深度只给 1..3：后端 `_query_nodes_sync` 会把 `max_depth` 夹到 3，界面上不给做不到的档位。
 * - 「配置抽取器 / 开始索引 / 重置」只对可管理知识库出现（按 `can_manage`，授权仍在后端）。
 * - 构建状态自带 5 秒轮询（`useGraphBuildStatus` 只在任务在跑时轮询）。
 */
import * as React from 'react';
import { Database, RefreshCw, Search, Settings } from 'lucide-react';
import { Empty as SharedEmpty } from '@/shared/ui/empty';
import { Button, Input, Spin } from 'antd';
import { useNotifications } from '@/shared/ui/notifications';
import { useConfirm } from '@/shared/ui/confirm-dialog';

import type { GraphEdge, GraphNode } from '../api/graph-api';
import { hasPendingGraphChunks, isGraphBuildRunning } from '../lib/graph-build';
import { summarizeGraph, toGraphView } from '../lib/graph-view';
import {
  DEFAULT_SUBGRAPH_PARAMS,
  useConfigureGraphBuild,
  useGraphBuildStatus,
  useIndexGraphBuild,
  useReconcileGraphBuild,
  useResetGraphBuild,
  useGraphSubgraph,
  type GraphSubgraphParams,
} from '../model/graph-queries';
import { GraphBuildPanel } from './graph-build-panel';
import { GraphCanvas } from './graph-canvas';
import { GraphConfigDialog } from './graph-config-dialog';
import { GraphDetailPanel } from './graph-detail-panel';
import { GraphFailedChunksDialog } from './graph-failed-chunks-dialog';

/** 后端把 `max_depth` 夹在 3，因此界面最大值与它一致。 */
const MAX_DEPTH = 3;

/** 后端对 `max_nodes` 的约束是 1..1000，界面给 10..1000。 */
const MIN_NODES = 10;
const MAX_NODES = 1000;

type GraphEmptyActionsProps = {
  locked: boolean;
  readOnly: boolean;
  searching: boolean;
  pending: boolean;
  buildRunning: boolean;
  busy: boolean;
  onConfigure: () => void;
  onClearSearch: () => void;
  onStartIndex: () => void;
  onRefresh: () => void;
};

/** 空态的动作：未锁定时只有「配置抽取器」；已锁定后按「清空搜索 → 开始索引 → 刷新图谱」。 */
const GraphEmptyActions = ({
  locked,
  readOnly,
  searching,
  pending,
  buildRunning,
  busy,
  onConfigure,
  onClearSearch,
  onStartIndex,
  onRefresh,
}: GraphEmptyActionsProps) => {
  if (!locked && !readOnly) {
    return (
      <Button htmlType="button" onClick={onConfigure}>
        <Settings className="size-4" />
        配置抽取器
      </Button>
    );
  }
  if (searching) {
    return (
      <Button htmlType="button" variant="outlined" onClick={onClearSearch}>
        <Search className="size-4" />
        清空搜索
      </Button>
    );
  }
  if (!readOnly && pending && !buildRunning) {
    return (
      <Button htmlType="button" disabled={busy} onClick={onStartIndex}>
        <Database className="size-4" />
        开始索引
      </Button>
    );
  }
  return (
    <Button htmlType="button" variant="outlined" onClick={onRefresh}>
      <RefreshCw className="size-4" />
      刷新图谱
    </Button>
  );
};

export type KnowledgeGraphPanelProps = {
  kbId: string;
  readOnly: boolean;
};

export const KnowledgeGraphPanel = ({
  kbId,
  readOnly,
}: KnowledgeGraphPanelProps) => {
  const { confirm } = useConfirm();
  const notifications = useNotifications();
  const status = useGraphBuildStatus(kbId);
  const [searchInput, setSearchInput] = React.useState('');
  const [draftParams, setDraftParams] = React.useState<GraphSubgraphParams>(
    DEFAULT_SUBGRAPH_PARAMS,
  );
  const [appliedParams, setAppliedParams] = React.useState<GraphSubgraphParams>(
    DEFAULT_SUBGRAPH_PARAMS,
  );
  const subgraph = useGraphSubgraph(kbId, appliedParams);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showBuildPanel, setShowBuildPanel] = React.useState(false);
  const [selected, setSelected] = React.useState<{
    item: GraphNode | GraphEdge;
    type: 'node' | 'edge';
  } | null>(null);
  const [configOpen, setConfigOpen] = React.useState(false);
  const [failedOpen, setFailedOpen] = React.useState(false);

  const configure = useConfigureGraphBuild(kbId);
  const index = useIndexGraphBuild(kbId);
  const reset = useResetGraphBuild(kbId);
  const reconcile = useReconcileGraphBuild(kbId);
  const busy =
    configure.isPending ||
    index.isPending ||
    reset.isPending ||
    reconcile.isPending;

  const view = React.useMemo(
    () => toGraphView(subgraph.data ?? { nodes: [], edges: [] }),
    [subgraph.data],
  );

  const notifyFailure = (error: unknown, fallback: string) =>
    notifications.addNotification({
      type: 'error',
      title: '知识图谱',
      message: error instanceof Error ? error.message : fallback,
    });

  const applySearch = () => {
    setAppliedParams((current) => ({
      ...current,
      nodeLabel: searchInput.trim() || '*',
    }));
  };

  const applySettings = () => {
    setAppliedParams(draftParams);
    setShowSettings(false);
  };

  const startIndex = async () => {
    try {
      const result = await index.mutateAsync();
      notifications.addNotification({
        type: 'success',
        title: '知识图谱',
        message: result.message || '图谱构建任务已提交。',
      });
    } catch (error) {
      notifyFailure(error, '提交图谱构建任务失败。');
    }
  };

  const retryVectors = async () => {
    try {
      await reconcile.mutateAsync('failed');
      notifications.addNotification({
        type: 'success',
        title: '知识图谱',
        message: '已重置失败的向量记录，可重新发起索引。',
      });
    } catch (error) {
      notifyFailure(error, '重试失败向量失败。');
    }
  };

  const confirmReset = async () => {
    const confirmed = await confirm({
      title: '重置图谱构建',
      description:
        '会清空抽取结果与已锁定的配置，已构建的图谱节点不会自动删除。确定继续吗？',
      confirmText: '重置',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await reset.mutateAsync({
        clearExtractionResult: true,
        clearConfig: true,
      });
      setSelected(null);
      notifications.addNotification({
        type: 'success',
        title: '知识图谱',
        message: '图谱构建状态已重置。',
      });
    } catch (error) {
      notifyFailure(error, '重置图谱构建状态失败。');
    }
  };

  const submitConfig = async (
    input: Parameters<typeof configure.mutateAsync>[0],
  ) => {
    try {
      await configure.mutateAsync(input);
      setConfigOpen(false);
      notifications.addNotification({
        type: 'success',
        title: '知识图谱',
        message: '图谱抽取配置已锁定。',
      });
    } catch (error) {
      notifyFailure(error, '保存图谱抽取配置失败。');
    }
  };

  const buildStatus = status.data;
  const pending = hasPendingGraphChunks(buildStatus);
  const locked = Boolean(buildStatus?.locked);
  const hasNodes = view.nodes.length > 0;
  const searching = appliedParams.nodeLabel !== '*';
  const isBuildRunning = isGraphBuildRunning(buildStatus);
  const stats = summarizeGraph(view);

  return (
    <div className="relative flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Input
              aria-label="搜索实体"
              className="w-64 pr-8"
              placeholder="搜索实体"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applySearch();
              }}
            />
            <button
              type="button"
              aria-label="搜索"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-color-text-3"
              onClick={applySearch}
            >
              {subgraph.isFetching ? (
                <Spin className="size-3.5" />
              ) : (
                <Search className="size-3.5" />
              )}
            </button>
          </div>
          <Button
            htmlType="button"
            variant="outlined"
            size="small"
            aria-label="刷新图谱"
            onClick={() => void subgraph.refetch()}
          >
            <RefreshCw
              className={subgraph.isFetching ? 'size-4 animate-spin' : 'size-4'}
            />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {!readOnly ? (
            <Button
              htmlType="button"
              variant="outlined"
              aria-label="索引管理"
              className={locked ? 'gap-2' : undefined}
              onClick={() => setShowBuildPanel((current) => !current)}
            >
              <Database className="size-4" />
              {pending ? `${buildStatus?.pending_chunks} 待索引` : null}
            </Button>
          ) : null}
          <Button
            htmlType="button"
            variant="outlined"
            size="small"
            aria-label="图谱设置"
            onClick={() => {
              setDraftParams(appliedParams);
              setShowSettings((current) => !current);
            }}
          >
            <Settings className="size-4" />
          </Button>
        </div>
      </div>

      <div className="relative">
        {subgraph.isError ? (
          <div className="flex h-[520px] flex-col items-center justify-center gap-3 rounded-large border border-color-border-1">
            <p role="alert" className="text-sm text-danger-6">
              加载图谱失败：
              {subgraph.error instanceof Error
                ? subgraph.error.message
                : '未知错误'}
            </p>
            <Button
              htmlType="button"
              variant="outlined"
              onClick={() => void subgraph.refetch()}
            >
              <RefreshCw className="size-4" />
              重试
            </Button>
          </div>
        ) : status.isLoading || subgraph.isLoading ? (
          <div className="flex h-[520px] items-center justify-center rounded-large border border-color-border-1">
            <Spin size="large" />
          </div>
        ) : (
          <GraphCanvas
            view={view}
            onNodeClick={(node) => setSelected({ item: node, type: 'node' })}
            onEdgeClick={(edge) => setSelected({ item: edge, type: 'edge' })}
            onCanvasClick={() => setSelected(null)}
          />
        )}

        {!subgraph.isError &&
        !status.isLoading &&
        !subgraph.isLoading &&
        !hasNodes ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-large bg-color-bg-1/80">
            <SharedEmpty
              icon={Database}
              description={
                !locked
                  ? readOnly
                    ? '图谱尚未构建，请等待知识库管理员配置抽取器并索引后查看。'
                    : '配置抽取器后，才能从当前知识库构建实体与关系。'
                  : searching
                    ? '没有匹配的实体，换个关键词或清空搜索。'
                    : '当前知识库还没有可展示的图谱数据。'
              }
              action={
                <GraphEmptyActions
                  locked={locked}
                  readOnly={readOnly}
                  searching={searching}
                  pending={pending}
                  buildRunning={isBuildRunning}
                  busy={busy}
                  onConfigure={() => setConfigOpen(true)}
                  onClearSearch={() => {
                    setSearchInput('');
                    setAppliedParams((current) => ({
                      ...current,
                      nodeLabel: '*',
                    }));
                  }}
                  onStartIndex={() => void startIndex()}
                  onRefresh={() => void subgraph.refetch()}
                />
              }
            />
          </div>
        ) : null}

        {hasNodes ? (
          <div
            aria-label="图谱类型分布"
            className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-color-text-3"
          >
            <span>节点 {stats.nodeCount}</span>
            <span>关系 {stats.edgeCount}</span>
            {stats.nodeTypes.map((item) => (
              <span key={`node-${item.label}`}>
                {item.label} · {item.count}
              </span>
            ))}
            {stats.edgeTypes.map((item) => (
              <span key={`edge-${item.label}`}>
                {item.label} · {item.count}
              </span>
            ))}
          </div>
        ) : null}

        {selected ? (
          <GraphDetailPanel
            visible
            item={selected.item}
            type={selected.type}
            onClose={() => setSelected(null)}
          />
        ) : null}

        {showSettings ? (
          <section
            aria-label="图谱设置"
            className="absolute right-2.5 top-14 flex w-[260px] flex-col gap-3 rounded-large border border-color-border-1 bg-color-bg-1 px-3 py-3 shadow-lg"
          >
            <span className="text-sm font-medium text-color-text-1">
              图谱设置
            </span>
            <div className="flex flex-col gap-1 text-xs text-color-text-2">
              <label htmlFor="graph-max-nodes">最大节点数</label>
              <Input
                id="graph-max-nodes"
                type="number"
                min={10}
                max={1000}
                step={10}
                value={draftParams.maxNodes}
                onChange={(event) =>
                  setDraftParams((current) => ({
                    ...current,
                    maxNodes: Math.min(
                      MAX_NODES,
                      Math.max(
                        MIN_NODES,
                        Number(event.target.value) || MIN_NODES,
                      ),
                    ),
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-1 text-xs text-color-text-2">
              <label htmlFor="graph-max-depth">
                搜索深度（后端上限 {MAX_DEPTH}）
              </label>
              <Input
                id="graph-max-depth"
                type="number"
                min={1}
                max={MAX_DEPTH}
                value={draftParams.maxDepth}
                onChange={(event) =>
                  setDraftParams((current) => ({
                    ...current,
                    maxDepth: Math.min(
                      MAX_DEPTH,
                      Math.max(1, Number(event.target.value)),
                    ),
                  }))
                }
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-color-text-2">
              <input
                type="checkbox"
                checked={draftParams.excludeChunk}
                onChange={(event) =>
                  setDraftParams((current) => ({
                    ...current,
                    excludeChunk: event.target.checked,
                  }))
                }
              />
              排除 Chunk 节点
            </label>
            <Button htmlType="button" onClick={applySettings}>
              应用
            </Button>
          </section>
        ) : null}

        {showBuildPanel && !readOnly ? (
          <GraphBuildPanel
            status={buildStatus}
            loading={status.isFetching}
            busy={busy}
            onRefresh={() => void status.refetch()}
            onConfigure={() => setConfigOpen(true)}
            onIndex={() => void startIndex()}
            onRetryVectors={() => void retryVectors()}
            onReset={() => void confirmReset()}
            onOpenFailedChunks={() => setFailedOpen(true)}
          />
        ) : null}
      </div>

      {configOpen ? (
        <GraphConfigDialog
          status={buildStatus}
          saving={configure.isPending}
          onOpenChange={setConfigOpen}
          onSubmit={(input) => void submitConfig(input)}
        />
      ) : null}
      {failedOpen ? (
        <GraphFailedChunksDialog kbId={kbId} onOpenChange={setFailedOpen} />
      ) : null}
    </div>
  );
};

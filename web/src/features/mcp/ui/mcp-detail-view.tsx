/** MCP 详情视图（`/extensions/mcp/:slug`）。 */
import * as React from 'react';
import {
  ArrowLeft,
  Copy,
  Info,
  Plus,
  RotateCw,
  Save,
  Search,
  Settings2,
  Trash2,
  Wand2,
  Wrench,
  Zap,
} from 'lucide-react';

import { Link, useNavigate } from 'react-router';

import {
  Alert,
  Button,
  Collapse,
  Input,
  Spin,
  Switch,
  Tag,
  Tooltip,
} from 'antd';

import {
  useDeleteMcpServer,
  useMcpServer,
  useMcpServerTools,
  useRefreshMcpServerTools,
  useSetMcpServerEnabled,
  useTestMcpServer,
  useToggleMcpServerTool,
  type McpServer,
  type McpTool,
} from '@/entities/mcp';
import { describeFailure } from '@/shared/api';
import { paths } from '@/shared/config';
import { copyTextToClipboard, formatMinuteStamp } from '@/shared/lib';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Empty as SharedEmpty } from '@/shared/ui/empty';

import { mcpActionLabel, transportLabel } from '../lib/mcp-view';
import { McpFormDialog } from './mcp-form-dialog';

type DetailTab = 'general' | 'tools';

type McpDetailViewProps = {
  slug: string;
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const McpDetailView = ({
  slug,
  notifySuccess,
  notifyError,
}: McpDetailViewProps) => {
  const navigate = useNavigate();
  const { confirm } = useConfirm();

  const { server, isLoading, error, refetch } = useMcpServer(slug);
  const migrationBlocked = server?.requiresMigration === true;
  const tools = useMcpServerTools(slug, Boolean(server) && !migrationBlocked);

  const testMutation = useTestMcpServer();
  const setEnabledMutation = useSetMcpServerEnabled();
  const deleteMutation = useDeleteMcpServer();
  const refreshToolsMutation = useRefreshMcpServerTools();
  const toggleToolMutation = useToggleMcpServerTool();

  const [activeTab, setActiveTab] = React.useState<DetailTab>('general');
  const [formOpen, setFormOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [toolKeyword, setToolKeyword] = React.useState('');
  const [togglingTool, setTogglingTool] = React.useState('');

  const visibleTools = React.useMemo(() => {
    const needle = toolKeyword.trim().toLowerCase();
    if (!needle) return tools.tools;

    return tools.tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(needle) ||
        tool.description.toLowerCase().includes(needle),
    );
  }, [toolKeyword, tools.tools]);

  const backTo = paths.app.extensions.getHref('mcp');

  const runTest = async () => {
    setBusy(true);
    try {
      const result = await testMutation.mutateAsync(slug);
      notifySuccess(
        result.message || `连接成功，共发现 ${result.toolCount} 个工具`,
      );
    } catch (failure) {
      notifyError(describeFailure(failure, '连接失败'));
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = async (target: McpServer, enabled: boolean) => {
    setBusy(true);
    try {
      const result = await setEnabledMutation.mutateAsync({
        slug: target.slug,
        enabled,
      });
      notifySuccess(result.message || `MCP 已${enabled ? '添加' : '移除'}`);
    } catch (failure) {
      notifyError(describeFailure(failure, '操作失败'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (target: McpServer) => {
    const confirmed = await confirm({
      title: '确认删除 MCP',
      description: `确定要删除 MCP "${target.name}" 吗？此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      destructive: true,
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await deleteMutation.mutateAsync(target.slug);
      notifySuccess('MCP 删除成功');
      navigate(backTo);
    } catch (failure) {
      notifyError(describeFailure(failure, '删除失败'));
    } finally {
      setBusy(false);
    }
  };

  const refreshTools = async () => {
    try {
      const result = await refreshToolsMutation.mutateAsync(slug);
      notifySuccess(result.message || '工具列表已刷新');
    } catch (failure) {
      notifyError(describeFailure(failure, '刷新失败'));
    }
  };

  const toggleTool = async (tool: McpTool) => {
    setTogglingTool(tool.name);
    try {
      const result = await toggleToolMutation.mutateAsync({
        slug,
        toolName: tool.name,
      });
      notifySuccess(result.message || `工具 '${tool.name}' 已切换`);
    } catch (failure) {
      notifyError(describeFailure(failure, '操作失败'));
    } finally {
      setTogglingTool('');
    }
  };

  const copyToolName = async (name: string) => {
    const ok = await copyTextToClipboard(name);
    if (ok) notifySuccess('已复制到剪贴板');
    else notifyError('复制失败');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin />
      </div>
    );
  }

  if (error || !server) {
    return (
      <div className="flex flex-col items-start gap-2 py-8">
        <p role="alert" className="text-sm text-danger-6">
          {error instanceof Error ? error.message : '未找到 MCP 服务器。'}
        </p>
        <div className="flex gap-2">
          <Button
            htmlType="button"
            variant="outlined"
            onClick={() => void refetch()}
          >
            重试
          </Button>
          <Link to={backTo} className="ant-btn ant-btn-text">
            返回列表
          </Link>
        </div>
      </div>
    );
  }

  const actionLabel = mcpActionLabel(server);
  const canAdd = !server.enabled && !server.requiresMigration;
  const canEdit = !server.isBuiltin;

  return (
    <div className="flex flex-col gap-4" data-testid="mcp-detail-view">
      <header className="flex flex-wrap items-center gap-3 border-b border-color-border-1 pb-3">
        <Link
          to={backTo}
          className="flex items-center gap-1.5 text-sm text-color-text-3 hover:text-color-text-1"
        >
          <ArrowLeft className="size-4" aria-hidden />
          返回
        </Link>

        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xl leading-none" aria-hidden>
            {server.icon || '🔌'}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-color-text-1">
              {server.name}
            </h1>
            <span className="text-xs text-color-text-3">
              {transportLabel(server.transport)}
            </span>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            htmlType="button"
            variant="outlined"
            size="small"
            disabled={busy || server.requiresMigration}
            title={server.requiresMigration ? '请先迁移为远程 MCP' : undefined}
            onClick={() => void runTest()}
          >
            <Zap className="size-3.5" aria-hidden />
            测试
          </Button>
          <Button
            htmlType="button"
            variant="outlined"
            size="small"
            disabled={busy || !canEdit}
            title={
              server.isBuiltin ? '系统内置 MCP 的连接配置由代码管理' : undefined
            }
            onClick={() => setFormOpen(true)}
          >
            <Save className="size-3.5" aria-hidden />
            编辑
          </Button>
          {canAdd ? (
            <Button
              htmlType="button"
              type="primary"
              size="small"
              loading={busy}
              onClick={() => void setEnabled(server, true)}
            >
              <Plus className="size-3.5" aria-hidden />
              添加
            </Button>
          ) : (
            <Button
              htmlType="button"
              color="danger"
              variant="solid"
              size="small"
              loading={busy}
              onClick={() =>
                server.isBuiltin
                  ? void setEnabled(server, false)
                  : void remove(server)
              }
            >
              <Trash2 className="size-3.5" aria-hidden />
              {actionLabel}
            </Button>
          )}
        </div>
      </header>

      {server.requiresMigration ? (
        <Alert
          type="warning"
          showIcon
          message="此 stdio MCP 已禁用，请编辑为 SSE 或 Streamable HTTP，或直接删除。"
        />
      ) : null}

      <nav className="flex items-center gap-0.5" aria-label="MCP 详情分区">
        {[
          { key: 'general' as const, label: '信息', icon: Settings2 },
          ...(migrationBlocked
            ? []
            : [
                {
                  key: 'tools' as const,
                  label: `工具 (${tools.tools.length})`,
                  icon: Wrench,
                },
              ]),
        ].map((tab) => {
          const active = tab.key === activeTab;
          const Icon = tab.icon;
          return (
            <Button
              key={tab.key}
              htmlType="button"
              type="text"
              className={`h-7 rounded-[6px] border-0 px-2.5 text-sm outline-none ${
                active
                  ? 'bg-[color-mix(in_srgb,var(--gray-800)_6%,var(--gray-0))] font-medium text-color-text-1'
                  : 'bg-transparent text-color-text-3 hover:bg-[var(--gray-50)] hover:text-color-text-1'
              }`}
              aria-current={active ? 'page' : undefined}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon className="size-3.5" aria-hidden />
              {tab.label}
            </Button>
          );
        })}
      </nav>

      {activeTab === 'general' ? (
        <dl className="grid gap-x-6 gap-y-3 rounded-large border border-color-border-1 bg-color-bg-1 p-4 sm:grid-cols-2">
          {server.description ? (
            <InfoRow label="描述" value={server.description} />
          ) : null}
          <InfoRow
            label="传输类型"
            value={<Tag>{transportLabel(server.transport)}</Tag>}
          />
          {server.tags.length ? (
            <InfoRow
              label="标签"
              value={
                <span className="flex flex-wrap gap-1">
                  {server.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </span>
              }
            />
          ) : null}
          {server.url ? (
            <InfoRow
              label="MCP URL"
              value={<span className="break-all font-mono">{server.url}</span>}
            />
          ) : null}
          {Object.keys(server.headers).length ? (
            <InfoRow
              label="请求头"
              value={
                <pre className="m-0 overflow-x-auto font-mono text-xs">
                  {JSON.stringify(server.headers, null, 2)}
                </pre>
              }
            />
          ) : null}
          {server.timeout ? (
            <InfoRow label="HTTP 超时" value={`${server.timeout} 秒`} />
          ) : null}
          {server.sseReadTimeout ? (
            <InfoRow
              label="SSE 读取超时"
              value={`${server.sseReadTimeout} 秒`}
            />
          ) : null}
          <InfoRow
            label="创建时间"
            value={formatMinuteStamp(server.createdAt)}
          />
          <InfoRow
            label="更新时间"
            value={formatMinuteStamp(server.updatedAt)}
          />
          <InfoRow label="创建人" value={server.createdBy || '-'} />
        </dl>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex min-w-56 flex-1 items-center">
              <Search
                className="pointer-events-none absolute left-2 size-4 text-color-text-3"
                aria-hidden
              />
              <Input
                className="pl-8"
                value={toolKeyword}
                aria-label="搜索工具"
                placeholder="搜索工具..."
                onChange={(event) => setToolKeyword(event.target.value)}
              />
            </div>
            <Button
              htmlType="button"
              variant="outlined"
              size="small"
              loading={refreshToolsMutation.isPending}
              onClick={() => void refreshTools()}
            >
              <RotateCw className="size-3.5" aria-hidden />
              刷新
            </Button>
          </div>

          {tools.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-color-text-3">
              <Spin aria-hidden className="size-4" />
              正在加载工具…
            </div>
          ) : visibleTools.length === 0 ? (
            <SharedEmpty
              icon={Wand2}
              description={
                tools.error instanceof Error ? tools.error.message : '暂无工具'
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {visibleTools.map((tool) => (
                <article
                  key={tool.name}
                  data-testid="mcp-tool-card"
                  className={`flex flex-col gap-2 rounded-large border border-color-border-1 bg-color-bg-1 p-3 ${
                    tool.enabled ? '' : 'opacity-60'
                  }`}
                >
                  <header className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-mono text-sm text-color-text-1">
                        {tool.name}
                      </span>
                      <Tooltip title={`ID: ${tool.id}`}>
                        <Info
                          className="size-3.5 shrink-0 text-color-text-3"
                          aria-hidden
                        />
                      </Tooltip>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Switch
                        size="small"
                        aria-label={`启停工具 ${tool.name}`}
                        checked={tool.enabled}
                        loading={togglingTool === tool.name}
                        onChange={() => void toggleTool(tool)}
                      />
                      <Tooltip title="复制工具名称">
                        <Button
                          htmlType="button"
                          type="text"
                          size="small"
                          aria-label={`复制 ${tool.name}`}
                          onClick={() => void copyToolName(tool.name)}
                        >
                          <Copy className="size-3.5" aria-hidden />
                        </Button>
                      </Tooltip>
                    </div>
                  </header>

                  {tool.description ? (
                    <p className="text-xs text-color-text-3">
                      {tool.description}
                    </p>
                  ) : null}

                  {Object.keys(tool.parameters).length ? (
                    <Collapse
                      ghost
                      size="small"
                      items={[
                        {
                          key: 'params',
                          label: '参数',
                          children: (
                            <div className="flex flex-col gap-2">
                              {Object.entries(tool.parameters).map(
                                ([name, parameter]) => (
                                  <div
                                    key={name}
                                    className="flex flex-col gap-0.5"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-xs text-color-text-1">
                                        {name}
                                      </span>
                                      {tool.required.includes(name) ? (
                                        <span className="text-[11px] text-danger-6">
                                          必填
                                        </span>
                                      ) : null}
                                      <span className="text-[11px] text-color-text-4">
                                        {parameter.type || 'any'}
                                      </span>
                                    </div>
                                    {parameter.description ? (
                                      <span className="text-xs text-color-text-3">
                                        {parameter.description}
                                      </span>
                                    ) : null}
                                  </div>
                                ),
                              )}
                            </div>
                          ),
                        },
                      ]}
                    />
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      <McpFormDialog
        open={formOpen}
        server={server}
        onOpenChange={setFormOpen}
        notifySuccess={notifySuccess}
        notifyError={notifyError}
      />
    </div>
  );
};

/** 只读信息表的一行：标签 + 值。 */
const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
    <dt className="text-color-text-3">{label}</dt>
    <dd className="m-0 min-w-0 break-words text-color-text-2">{value}</dd>
  </div>
);

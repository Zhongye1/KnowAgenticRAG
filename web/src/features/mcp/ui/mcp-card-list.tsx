/** MCP 面板（扩展页的「MCP」tab）。 */
import * as React from 'react';
import { Plug, Plus } from 'lucide-react';

import { useNavigate } from 'react-router';

import { Button, Spin } from 'antd';

import {
  useDeleteMcpServer,
  useMcpServers,
  useSetMcpServerEnabled,
  type McpServer,
} from '@/entities/mcp';
import { describeFailure } from '@/shared/api';
import { paths } from '@/shared/config';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Empty as SharedEmpty } from '@/shared/ui/empty';
import {
  ListPrimaryButton,
  ListRefreshButton,
  ListToolbar,
} from '@/shared/ui/list-toolbar';

import {
  filterMcpServers,
  sortMcpServers,
  splitMcpServers,
} from '../lib/mcp-view';
import { McpBasicInfoDialog } from './mcp-basic-info-dialog';
import { McpCard } from './mcp-card';
import { McpFormDialog } from './mcp-form-dialog';

type McpCardListProps = {
  notifySuccess: (message: string) => void;
  notifyError: (message: string) => void;
};

export const McpCardList = ({
  notifySuccess,
  notifyError,
}: McpCardListProps) => {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { servers, isLoading, isFetching, error, refetch } = useMcpServers();
  const setEnabledMutation = useSetMcpServerEnabled();
  const deleteMutation = useDeleteMcpServer();

  const [keyword, setKeyword] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<McpServer | null>(null);
  const [busySlug, setBusySlug] = React.useState('');

  const visible = React.useMemo(
    () => filterMcpServers(sortMcpServers(servers), keyword),
    [keyword, servers],
  );
  const groups = splitMcpServers(visible);

  const setServerEnabled = async (server: McpServer, enabled: boolean) => {
    setBusySlug(server.slug);
    try {
      const result = await setEnabledMutation.mutateAsync({
        slug: server.slug,
        enabled,
      });
      notifySuccess(result.message || `MCP 已${enabled ? '添加' : '移除'}`);
      if (enabled) setPreview(null);
    } catch (failure) {
      notifyError(describeFailure(failure, '操作失败'));
    } finally {
      setBusySlug('');
    }
  };

  const removeServer = async (server: McpServer) => {
    const confirmed = await confirm({
      title: '确认删除 MCP',
      description: `确定要删除 MCP "${server.name}" 吗？此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      destructive: true,
    });
    if (!confirmed) return;

    setBusySlug(server.slug);
    try {
      await deleteMutation.mutateAsync(server.slug);
      notifySuccess('MCP 删除成功');
    } catch (failure) {
      notifyError(describeFailure(failure, '删除失败'));
    } finally {
      setBusySlug('');
    }
  };

  const onAction = (server: McpServer) => {
    // 需迁移的历史 stdio MCP 只能删：后端对它们的启停一律拒绝（`set_server_enabled` 会
    // 抛「历史 stdio MCP 已被禁用」），而且它们永远带 `enabled: false`，不能落到「添加」分支
    if (server.requiresMigration) {
      void removeServer(server);
      return;
    }

    // 内置的只能从当前配置移除（库里还在，别的用户仍可添加）；其余走真删除
    if (!server.isBuiltin) {
      if (server.enabled) void removeServer(server);
      else void setServerEnabled(server, true);
      return;
    }

    void setServerEnabled(server, !server.enabled);
  };

  const onOpen = (server: McpServer) => {
    // 已启用的看详情；未启用且不是历史 stdio 的先看简介再决定
    if (server.enabled || server.requiresMigration) {
      navigate(paths.app.extensions.mcp.getHref(server.slug));
      return;
    }

    setPreview(server);
  };

  const renderGroup = (title: string, items: McpServer[]) =>
    items.length ? (
      <section className="flex flex-col gap-2">
        <h3 className="text-sm text-color-text-2">{title}</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {items.map((server) => (
            <McpCard
              key={server.slug}
              server={server}
              busy={busySlug === server.slug}
              onOpen={onOpen}
              onAction={onAction}
            />
          ))}
        </div>
      </section>
    ) : null;

  return (
    <div className="flex flex-col gap-4" data-testid="mcp-card-list">
      <ListToolbar
        search={{
          value: keyword,
          onChange: setKeyword,
          placeholder: '搜索 MCP...',
          label: '搜索 MCP',
        }}
        actions={
          <>
            <ListPrimaryButton onClick={() => setFormOpen(true)}>
              <Plus className="size-4" aria-hidden />
              添加 MCP
            </ListPrimaryButton>
            <ListRefreshButton
              label="刷新 MCP"
              refreshing={isFetching}
              onClick={() => void refetch()}
            />
          </>
        }
      />

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-color-text-3">
          <Spin aria-hidden className="size-4" />
          正在加载 MCP…
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-2 py-8">
          <p role="alert" className="text-sm text-danger-6">
            {error instanceof Error ? error.message : '加载 MCP 失败。'}
          </p>
          <Button
            htmlType="button"
            variant="outlined"
            onClick={() => void refetch()}
          >
            重试
          </Button>
        </div>
      ) : groups.enabled.length === 0 && groups.disabled.length === 0 ? (
        <SharedEmpty
          icon={Plug}
          description={
            keyword
              ? '无匹配 MCP。换个关键词试试。'
              : '暂无 MCP，点击上方按钮添加。'
          }
        />
      ) : (
        <>
          {renderGroup('已添加', groups.enabled)}
          {renderGroup('可添加', groups.disabled)}
        </>
      )}

      <McpFormDialog
        open={formOpen}
        server={null}
        onOpenChange={setFormOpen}
        notifySuccess={notifySuccess}
        notifyError={notifyError}
      />

      <McpBasicInfoDialog
        server={preview}
        adding={busySlug === preview?.slug}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        onAdd={(server) => void setServerEnabled(server, true)}
      />
    </div>
  );
};

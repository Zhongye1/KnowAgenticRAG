/**
 * 可添加 MCP 的简介弹窗。
 *
 * 对齐参照 `McpCardList.vue` 的 basic-info 弹窗：未启用的服务器点卡片先看简介，再决定是否添加。
 * 需迁移的历史 stdio MCP 不走这里——它们只能删除，卡片直接进详情页。
 */
import { Button, Modal, Tag } from 'antd';

import type { McpServer } from '@/entities/mcp';
import { formatExtensionTitle } from '@/shared/lib';

import { transportLabel } from '../lib/mcp-view';

type McpBasicInfoDialogProps = {
  server: McpServer | null;
  adding: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (server: McpServer) => void;
};

export const McpBasicInfoDialog = ({
  server,
  adding,
  onOpenChange,
  onAdd,
}: McpBasicInfoDialogProps) => (
  <Modal
    open={server !== null}
    footer={null}
    width={560}
    onCancel={() => onOpenChange(false)}
  >
    {server ? (
      <div className="flex flex-col gap-4">
        <header className="flex items-center gap-3">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-color-border-1 bg-color-bg-2 text-lg leading-none"
            aria-hidden
          >
            {server.icon || '🔌'}
          </span>
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-color-text-1">
              {formatExtensionTitle(server.name) || server.slug}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-color-text-3">
              <span>{transportLabel(server.transport)}</span>
              {server.isBuiltin ? (
                <span className="rounded-full bg-color-bg-3 px-1.5 text-[11px] font-semibold text-color-text-2">
                  内置
                </span>
              ) : null}
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-2.5 rounded-large border border-color-border-1 bg-color-bg-2 p-4 text-sm">
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="text-color-text-3">描述</span>
            <span className="break-words text-color-text-2">
              {server.description || '暂无描述'}
            </span>
          </div>
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="text-color-text-3">传输类型</span>
            <span className="break-words text-color-text-2">
              {transportLabel(server.transport)}
            </span>
          </div>
          {server.tags.length ? (
            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
              <span className="text-color-text-3">标签</span>
              <span className="flex flex-wrap gap-1.5">
                {server.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </span>
            </div>
          ) : null}
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="text-color-text-3">创建人</span>
            <span className="break-words text-color-text-2">
              {server.createdBy || '-'}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button htmlType="button" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            htmlType="button"
            type="primary"
            loading={adding}
            onClick={() => onAdd(server)}
          >
            添加
          </Button>
        </div>
      </div>
    ) : null}
  </Modal>
);

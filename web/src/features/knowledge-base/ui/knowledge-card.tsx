/**
 * 知识库卡片：列表页的一张卡。
 *
 * 名称、类型、描述、统计摘要与权限提示，右上角菜单提供复制 ID、编辑与删除；副标题展示
 * 文件/分块/大小统计（共享范围在详情页的「共享设置」里改）。
 *
 * 「只读」徽标来自 `can_manage`（当前用户的有效权限），不是连接器能力；只读时不给编辑与删除。
 */
import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import type { KnowledgeBase } from '../api/knowledge-api';
import {
  formatBytes,
  formatCount,
  getKbTypeLabel,
} from '../lib/knowledge-view';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

type KnowledgeCardProps = {
  database: KnowledgeBase;
  onOpen: (database: KnowledgeBase) => void;
  onEdit: (database: KnowledgeBase) => void;
  onDelete: (database: KnowledgeBase) => void;
  onCopyId: (database: KnowledgeBase) => void;
};

export const KnowledgeCard = ({
  database,
  onOpen,
  onEdit,
  onDelete,
  onCopyId,
}: KnowledgeCardProps) => {
  const stats = database.stats;

  return (
    <article
      className="group/card flex flex-col gap-2 rounded-large border border-color-border-1 bg-color-bg-1 p-4 transition-colors hover:border-color-border-3"
      data-testid="knowledge-card"
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            className="max-w-full truncate text-left text-sm font-medium text-color-text-1"
            onClick={() => onOpen(database)}
          >
            {database.name}
          </button>
          <span className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">
              {getKbTypeLabel(database.kb_type)}
            </Badge>
            {database.can_manage === false ? (
              <Badge variant="outline">只读</Badge>
            ) : null}
          </span>
        </h3>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`知识库操作：${database.name}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onCopyId(database)}>
              <Copy className="size-4" aria-hidden />
              复制 ID
            </DropdownMenuItem>
            {database.can_manage === false ? null : (
              <>
                <DropdownMenuItem onSelect={() => onEdit(database)}>
                  <Pencil className="size-4" aria-hidden />
                  编辑
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onDelete(database)}>
                  <Trash2 className="size-4" aria-hidden />
                  删除
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <p className="line-clamp-2 min-h-8 text-xs text-color-text-3">
        {database.description || '暂无描述'}
      </p>

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-color-text-3">
        <div className="flex gap-1">
          <dt>文件</dt>
          <dd className="text-color-text-2">{formatCount(stats.file_count)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>分块</dt>
          <dd className="text-color-text-2">
            {formatCount(stats.chunk_count)}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>大小</dt>
          <dd className="text-color-text-2">{formatBytes(stats.total_size)}</dd>
        </div>
        {stats.processing_count ? (
          <div className="flex gap-1">
            <dt>处理中</dt>
            <dd className="text-color-text-2">{stats.processing_count}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
};

/**
 * 知识库列表。
 *
 * 类型筛选 + 名称/描述搜索 + 卡片网格，「新建知识库」开表单对话框；删除前用命令式确认框；
 * 只读知识库不给管理入口。列表由页面外壳承载。
 */
import * as React from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';

import type { KnowledgeBase } from '../api/knowledge-api';
import { getKbTypeLabel } from '../lib/knowledge-view';
import {
  useDeleteKnowledgeBase,
  useKnowledgeBases,
  useKnowledgeTypes,
} from '../model/knowledge-queries';
import { Empty } from '@/shared/ui/empty';
import { Button } from '@/shared/ui/button';
import { confirm } from '@/shared/ui/confirm-dialog';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { useNotifications } from '@/shared/ui/notifications';

import { KnowledgeCard } from './knowledge-card';
import { KnowledgeFormDialog } from './knowledge-form-dialog';

type KnowledgeListProps = {
  /** 打开某个知识库详情。 */
  onOpen: (database: KnowledgeBase) => void;
};

/** 类型筛选的「全部」项在 Select 里需要一个非空值。 */
const ALL_TYPES = '__all__';

export const KnowledgeList = ({ onOpen }: KnowledgeListProps) => {
  const databases = useKnowledgeBases();
  const types = useKnowledgeTypes();
  const removeMutation = useDeleteKnowledgeBase();
  const notifications = useNotifications();
  const [keyword, setKeyword] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState(ALL_TYPES);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<KnowledgeBase | null>(null);

  const notifyError = (message: string) =>
    notifications.addNotification({ type: 'error', title: '知识库', message });

  const visible = React.useMemo(() => {
    const trimmed = keyword.trim().toLowerCase();
    return (databases.data ?? []).filter((database) => {
      // 后端缺省类型是 milvus：空 kb_type 也要能在该类型下筛出来
      if (
        typeFilter !== ALL_TYPES &&
        (database.kb_type || 'milvus') !== typeFilter
      ) {
        return false;
      }
      if (!trimmed) return true;
      return (
        database.name.toLowerCase().includes(trimmed) ||
        (database.description ?? '').toLowerCase().includes(trimmed)
      );
    });
  }, [databases.data, keyword, typeFilter]);

  const onDelete = async (database: KnowledgeBase) => {
    const confirmed = await confirm({
      title: `删除知识库「${database.name}」？`,
      description: '知识库与其文件记录会被删除，已有向量与图谱数据不再可用。',
      confirmText: '删除',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await removeMutation.mutateAsync(database.kb_id);
      notifications.addNotification({
        type: 'success',
        title: '知识库',
        message: `已删除「${database.name}」。`,
      });
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '删除知识库失败。');
    }
  };

  /** 复制 ID 要能区分成败：shared 的 `useCopyToClipboard` 把失败吞掉了。 */
  const onCopyId = async (database: KnowledgeBase) => {
    try {
      await navigator.clipboard.writeText(database.kb_id);
      notifications.addNotification({
        type: 'success',
        title: '知识库',
        message: 'ID 已复制。',
      });
    } catch {
      notifyError('复制失败，请手动选择 ID。');
    }
  };

  const typeOptions = Object.keys(types.data ?? {});

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-color-text-3"
            aria-hidden
          />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索名称或描述"
            aria-label="搜索知识库"
            className="pl-8"
          />
        </div>

        {typeOptions.length > 0 ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={typeFilter === ALL_TYPES ? 'default' : 'outline'}
              onClick={() => setTypeFilter(ALL_TYPES)}
            >
              全部
            </Button>
            {typeOptions.map((type) => (
              <Button
                key={type}
                type="button"
                size="sm"
                variant={typeFilter === type ? 'default' : 'outline'}
                onClick={() => setTypeFilter(type)}
              >
                {getKbTypeLabel(type)}
              </Button>
            ))}
          </div>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="刷新知识库列表"
          onClick={() => void databases.refetch()}
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          type="button"
          disabled={
            !types.isSuccess || Object.keys(types.data ?? {}).length === 0
          }
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden />
          新建知识库
        </Button>
      </div>

      {databases.isPending ? (
        <p className="flex items-center gap-2 py-8 text-sm text-color-text-3">
          <Spinner aria-hidden className="size-4" />
          正在加载知识库…
        </p>
      ) : null}

      {databases.isError ? (
        <div className="flex flex-col items-start gap-2 py-6">
          <p role="alert" className="text-sm text-danger-6">
            {databases.error instanceof Error
              ? databases.error.message
              : '加载知识库失败。'}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void databases.refetch()}
          >
            重试
          </Button>
        </div>
      ) : null}

      {databases.isSuccess && visible.length === 0 ? (
        <Empty
          description={
            (databases.data ?? []).length === 0
              ? '还没有知识库。新建一个后即可上传文档。'
              : '没有匹配的知识库，试试别的关键词或类型。'
          }
          action={
            (databases.data ?? []).length === 0 ? (
              <Button
                type="button"
                onClick={() => {
                  // 必须清掉上一次的编辑对象，否则会把已删的知识库打开成编辑态
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                新建知识库
              </Button>
            ) : null
          }
        />
      ) : null}

      {visible.length > 0 ? (
        <div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          data-testid="knowledge-grid"
        >
          {visible.map((database) => (
            <KnowledgeCard
              key={database.kb_id}
              database={database}
              onOpen={onOpen}
              onCopyId={(item) => void onCopyId(item)}
              onEdit={(item) => {
                setEditing(item);
                setFormOpen(true);
              }}
              onDelete={(item) => void onDelete(item)}
            />
          ))}
        </div>
      ) : null}

      {/* 只在打开期间挂载：表单初值取自 props，不需要「打开时重置」的 effect */}
      {formOpen ? (
        <KnowledgeFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          database={editing}
        />
      ) : null}
    </div>
  );
};

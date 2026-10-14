/**
 * 知识库列表。
 *
 * 类型筛选 + 名称/描述搜索 + 卡片网格，「新建知识库」开表单对话框；删除前用命令式确认框；
 * 只读知识库不给管理入口。列表由页面外壳承载。
 */
import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button, Spin } from 'antd';
import { Empty as SharedEmpty } from '@/shared/ui/empty';
import {
  ListPrimaryButton,
  ListRefreshButton,
  ListToolbar,
} from '@/shared/ui/list-toolbar';
import { useNotifications } from '@/shared/ui/notifications';
import { useConfirm } from '@/shared/ui/confirm-dialog';

import type { KnowledgeBase } from '../api/knowledge-api';
import { getKbTypeLabel } from '../lib/knowledge-view';
import {
  useDeleteKnowledgeBase,
  useKnowledgeBases,
  useKnowledgeTypes,
} from '../model/knowledge-queries';

import { KnowledgeCard } from './knowledge-card';
import { KnowledgeFormDialog } from './knowledge-form-dialog';

type KnowledgeListProps = {
  /** 打开某个知识库详情。 */
  onOpen: (database: KnowledgeBase) => void;
};

/** 类型筛选的「全部」项在 Select 里需要一个非空值。 */
const ALL_TYPES = '__all__';

export const KnowledgeList = ({ onOpen }: KnowledgeListProps) => {
  const { confirm } = useConfirm();
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
      <ListToolbar
        search={{
          value: keyword,
          onChange: setKeyword,
          placeholder: '搜索名称或描述',
          label: '搜索知识库',
        }}
        filters={
          typeOptions.length > 0 ? (
            <div className="flex items-center gap-1">
              <Button
                htmlType="button"
                size="small"
                variant={typeFilter === ALL_TYPES ? 'solid' : 'outlined'}
                color={typeFilter === ALL_TYPES ? 'primary' : 'default'}
                onClick={() => setTypeFilter(ALL_TYPES)}
              >
                全部
              </Button>
              {typeOptions.map((type) => (
                <Button
                  key={type}
                  htmlType="button"
                  size="small"
                  variant={typeFilter === type ? 'solid' : 'outlined'}
                  color={typeFilter === type ? 'primary' : 'default'}
                  onClick={() => setTypeFilter(type)}
                >
                  {getKbTypeLabel(type)}
                </Button>
              ))}
            </div>
          ) : null
        }
        actions={
          <>
            <ListPrimaryButton
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
            </ListPrimaryButton>
            <ListRefreshButton
              label="刷新知识库列表"
              refreshing={databases.isFetching}
              onClick={() => void databases.refetch()}
            />
          </>
        }
      />

      {databases.isPending ? (
        <p className="flex items-center gap-2 py-8 text-sm text-color-text-3">
          <Spin aria-hidden className="size-4" />
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
            htmlType="button"
            variant="outlined"
            onClick={() => void databases.refetch()}
          >
            重试
          </Button>
        </div>
      ) : null}

      {databases.isSuccess && visible.length === 0 ? (
        <SharedEmpty
          description={
            (databases.data ?? []).length === 0
              ? '还没有知识库。新建一个后即可上传文档。'
              : '没有匹配的知识库，试试别的关键词或类型。'
          }
          action={
            (databases.data ?? []).length === 0 ? (
              <Button
                htmlType="button"
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

/**
 * 知识库卡片：列表页的一张卡。
 *
 * 结构与样式走 `shared/ui` 的 `InfoCard`（对齐参照 `InfoCard.vue`）：32px 图标块 + 名称 +
 * 副标题（创建时间 · 文件数）+ 两行描述 + 类型/只读标签 + 统计摘要，右上角菜单提供
 * 复制 ID、编辑与删除。「只读」来自 `can_manage`（当前用户的有效权限），不是连接器能力；
 * 只读时不给编辑与删除。
 *
 * 与参照 `DataBaseView.vue` 的显式偏离（见决策记录）：参照的标签行还带共享范围与嵌入模型；
 * 本仓不放共享标签（共享范围在详情页的「共享设置」里改），统计摘要保留在描述下方。
 */
import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button, Dropdown } from 'antd';

import { formatRelativeTime } from '@/shared/lib';
import { InfoCard, type InfoCardTag } from '@/shared/ui/info-card';

import type { KnowledgeBase } from '../api/knowledge-api';
import {
  formatBytes,
  formatCount,
  getKbTypeLabel,
} from '../lib/knowledge-view';

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
  const tags: InfoCardTag[] = [
    { name: getKbTypeLabel(database.kb_type), color: 'blue' },
    ...(database.can_manage === false
      ? [{ name: '只读', color: 'gray' as const }]
      : []),
  ];

  return (
    <InfoCard
      slug={database.kb_id}
      testId="knowledge-card"
      title={database.name}
      subtitle={[
        // 参照的副标题口径：相对时间 + 文件数（创建时间缺失时只留文件数）
        database.created_at
          ? `${formatRelativeTime(database.created_at)}创建`
          : null,
        `${formatCount(stats.file_count)} 文件`,
      ]
        .filter(Boolean)
        .join(' · ')}
      description={database.description || '暂无描述'}
      tags={tags}
      onOpen={() => onOpen(database)}
      action={
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'copy-id',
                label: (
                  <span className="flex items-center gap-2">
                    <Copy className="size-4" aria-hidden />
                    复制 ID
                  </span>
                ),
              },
              ...(database.can_manage === false
                ? []
                : [
                    {
                      key: 'edit',
                      label: (
                        <span className="flex items-center gap-2">
                          <Pencil className="size-4" aria-hidden />
                          编辑
                        </span>
                      ),
                    },
                    {
                      key: 'delete',
                      label: (
                        <span className="flex items-center gap-2">
                          <Trash2 className="size-4" aria-hidden />
                          删除
                        </span>
                      ),
                      danger: true,
                    },
                  ]),
            ],
            onClick: ({ key }) => {
              if (key === 'copy-id') onCopyId(database);
              if (key === 'edit') onEdit(database);
              if (key === 'delete') onDelete(database);
            },
          }}
        >
          <Button
            htmlType="button"
            type="text"
            size="small"
            aria-label={`知识库操作：${database.name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </Dropdown>
      }
    >
      <dl className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--gray-500)]">
        <div className="flex gap-1">
          <dt>文件</dt>
          <dd className="m-0 text-[var(--gray-700)]">
            {formatCount(stats.file_count)}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>分块</dt>
          <dd className="m-0 text-[var(--gray-700)]">
            {formatCount(stats.chunk_count)}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>大小</dt>
          <dd className="m-0 text-[var(--gray-700)]">
            {formatBytes(stats.total_size)}
          </dd>
        </div>
        {stats.processing_count ? (
          <div className="flex gap-1">
            <dt>处理中</dt>
            <dd className="m-0 text-[var(--gray-700)]">
              {stats.processing_count}
            </dd>
          </div>
        ) : null}
      </dl>
    </InfoCard>
  );
};

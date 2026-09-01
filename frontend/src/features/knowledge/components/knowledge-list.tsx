import dayjs from 'dayjs';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Table } from '@/components/ui/table';
import type { BaseEntity } from '@/types/api';

import type { KnowledgeBase } from '../api/types';

import { DeleteKnowledgeBase } from './delete-knowledge-base';

type KnowledgeListItem = KnowledgeBase & BaseEntity;

type KnowledgeListProps = {
  items: KnowledgeBase[];
  isLoading: boolean;
  selectedKbName: string | null;
  onSelect: (kbName: string | null) => void;
};

export function KnowledgeList({
  items,
  isLoading,
  selectedKbName,
  onSelect,
}: KnowledgeListProps) {
  const rows = useMemo<KnowledgeListItem[]>(
    () =>
      items.map((kb) => ({
        ...kb,
        id: kb.kb_name,
        createdAt: Date.parse(kb.created_time),
      })),
    [items],
  );

  if (isLoading) {
    return (
      <div className="flex h-48 w-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <Table
      data={rows}
      columns={[
        {
          title: '名称',
          field: 'display_name',
          Cell({ entry }) {
            return (
              <span>
                {entry.display_name}
                <span className="ml-2 font-mono text-xs text-color-text-2">
                  {entry.kb_name}
                </span>
              </span>
            );
          },
        },
        {
          title: '文档',
          field: 'documents',
        },
        {
          title: '文本向量',
          field: 'text_vectors',
        },
        {
          title: '视觉向量',
          field: 'visual_vectors',
        },
        {
          title: '创建时间',
          field: 'created_time',
          Cell({ entry }) {
            return (
              <span>{dayjs(entry.created_time).format('YYYY-MM-DD HH:mm')}</span>
            );
          },
        },
        {
          title: '',
          field: 'kb_name',
          Cell({ entry }) {
            const active = entry.kb_name === selectedKbName;
            return (
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => onSelect(active ? null : entry.kb_name)}
                >
                  {active ? '收起文档' : '查看文档'}
                </Button>
                <DeleteKnowledgeBase kbName={entry.kb_name} />
              </div>
            );
          },
        },
      ]}
    />
  );
}

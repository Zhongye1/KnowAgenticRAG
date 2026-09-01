import dayjs from 'dayjs';
import { useMemo } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { Table } from '@/components/ui/table';
import type { BaseEntity } from '@/types/api';

import { useDocuments } from '../api/documents';
import type { DocumentItem } from '../api/types';

type KnowledgeDocumentRow = DocumentItem & BaseEntity;

type KnowledgeDocumentsProps = {
  kbName: string | null;
};

export function KnowledgeDocuments({ kbName }: KnowledgeDocumentsProps) {
  const documentsQuery = useDocuments(kbName ?? '');

  const rows = useMemo<KnowledgeDocumentRow[]>(
    () =>
      (documentsQuery.data?.data?.items ?? []).map((doc) => ({
        ...doc,
        id: doc.document_id,
        createdAt: Date.parse(doc.created_time),
      })),
    [documentsQuery.data],
  );

  if (!kbName) return null;

  return (
    <section className="rounded-lg border border-color-border-2 bg-color-bg-1 p-4">
      <h2 className="mb-3 text-sm font-medium">
        {kbName} · 文档（{documentsQuery.data?.data?.total ?? 0}）
      </h2>
      {documentsQuery.isLoading ? (
        <div className="flex h-32 w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <Table
          data={rows}
          columns={[
            {
              title: '文档名称',
              field: 'name',
              Cell({ entry }) {
                return (
                  <span>
                    {entry.name}
                    <span className="ml-2 font-mono text-xs text-color-text-2">
                      {entry.document_id}
                    </span>
                  </span>
                );
              },
            },
            {
              title: '类型',
              field: 'source_type',
              Cell({ entry }) {
                return (
                  <span className="font-mono text-xs">{entry.source_type}</span>
                );
              },
            },
            {
              title: '状态',
              field: 'status',
              Cell({ entry }) {
                return <span>{entry.status}</span>;
              },
            },
            {
              title: '文本块',
              field: 'chunk_count',
            },
            {
              title: '创建时间',
              field: 'created_time',
              Cell({ entry }) {
                return (
                  <span>
                    {dayjs(entry.created_time).format('YYYY-MM-DD HH:mm')}
                  </span>
                );
              },
            },
          ]}
        />
      )}
    </section>
  );
}

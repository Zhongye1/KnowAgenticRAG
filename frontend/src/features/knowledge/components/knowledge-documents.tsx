import { UploadSimple } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { useMemo, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Table } from '@/components/ui/table';
import { useNotifications } from '@/components/ui/notifications';
import type { BaseEntity } from '@/types/api';

import {
  getDocumentDownloadUrl,
  useDocuments,
  useUploadDocument,
} from '../api/documents';
import type { DocumentItem } from '../api/types';
import { DocumentActions } from './document-actions';

type KnowledgeDocumentRow = DocumentItem & BaseEntity;

type KnowledgeDocumentsProps = {
  kbName: string | null;
};

export function KnowledgeDocuments({ kbName }: KnowledgeDocumentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addNotification } = useNotifications();
  const documentsQuery = useDocuments(kbName ?? '');
  const uploadMutation = useUploadDocument({
    mutationConfig: {
      onSuccess: (data) => {
        addNotification({
          type: 'success',
          title: '文档上传成功',
          message: data.data.name,
        });
      },
      onError: () => {
        addNotification({
          type: 'error',
          title: '上传失败',
          message: '请检查文件是否重复或对象存储是否可用',
        });
      },
    },
  });

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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadMutation.mutate({ kbName, file });
    }
    event.target.value = '';
  };

  const handleDownload = async (documentId: string) => {
    try {
      const { data } = await getDocumentDownloadUrl(documentId);
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      addNotification({
        type: 'error',
        title: '获取下载链接失败',
        message: documentId,
      });
    }
  };

  return (
    <section className="rounded-lg border border-color-border-2 bg-color-bg-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {kbName} · 文档（{documentsQuery.data?.data?.total ?? 0}）
        </h2>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          size="sm"
          disabled={uploadMutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadSimple className="size-4" />
          {uploadMutation.isPending ? '上传中…' : '上传文档'}
        </Button>
      </div>
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
            {
              title: '操作',
              field: 'document_id',
              Cell({ entry }) {
                return (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(entry.document_id)}
                    >
                      下载
                    </Button>
                    <DocumentActions kbName={kbName} doc={entry} />
                  </div>
                );
              },
            },
          ]}
        />
      )}
    </section>
  );
}

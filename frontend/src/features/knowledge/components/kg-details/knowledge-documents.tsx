import { ArrowLeft, UploadSimple } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { useMemo, useRef, type ChangeEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Table } from '@/components/ui/table';
import { useNotifications } from '@/components/ui/notifications';
import type { BaseEntity } from '@/types/api';
import { cn } from '@/lib/utils';

import {
  getDocumentDownloadUrl,
  useDocuments,
  useUploadDocument,
} from '../../api/documents';
import type { DocumentItem, KnowledgeBase } from '../../api/types';
import { DocumentActions } from './document-actions';

type KnowledgeDocumentRow = DocumentItem & BaseEntity;

type KnowledgeDocumentsProps = {
  kb: KnowledgeBase;
  /** 可选：文档详情页的返回入口（列表页内联面板不再使用） */
  onBack?: () => void;
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-warning-6/10 text-warning-6',
  parsing: 'bg-primary-6/10 text-primary-6',
  indexing: 'bg-primary-6/10 text-primary-6',
  embedding: 'bg-primary-6/10 text-primary-6',
  ready: 'bg-success-6/10 text-success-6',
  failed: 'bg-danger-6/10 text-danger-6',
};

export function KnowledgeDocuments({ kb, onBack }: KnowledgeDocumentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addNotification } = useNotifications();
  const documentsQuery = useDocuments(kb.kb_name);
  const uploadMutation = useUploadDocument({
    mutationConfig: {
      onSuccess: (data) => {
        addNotification({
          type: 'success',
          title: '文档上传成功',
          message: data.name,
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
      (documentsQuery.data?.items ?? []).map((doc) => ({
        ...doc,
        id: doc.document_id,
        createdAt: Date.parse(doc.created_time),
      })),
    [documentsQuery.data],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadMutation.mutate({ kbName: kb.kb_name, file });
    }
    event.target.value = '';
  };

  const handleDownload = async (documentId: string) => {
    try {
      const { url } = await getDocumentDownloadUrl(documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      addNotification({
        type: 'error',
        title: '获取下载链接失败',
        message: documentId,
      });
    }
  };

  const total = documentsQuery.data?.total ?? 0;

  return (
    <Card size="sm" data-slot="knowledge-documents-panel">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {onBack ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="返回知识库列表"
              title="返回知识库列表"
              className="shrink-0"
              onClick={onBack}
            >
              <ArrowLeft />
            </Button>
          ) : null}
          <CardTitle className="min-w-0 truncate">
            {kb.display_name}
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
              {kb.kb_name}
            </span>
          </CardTitle>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
      </CardHeader>
      <CardContent>
        {documentsQuery.isLoading ? (
          <div className="flex h-32 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <UploadSimple className="size-8 opacity-60" aria-hidden="true" />
            <p className="text-xs">
              还没有文档，上传第一个文档开始构建知识库。
            </p>
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
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
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
                    <span className="font-mono text-xs">
                      {entry.source_type}
                    </span>
                  );
                },
              },
              {
                title: '状态',
                field: 'status',
                Cell({ entry }) {
                  return (
                    <span
                      className={cn(
                        'inline-flex rounded-medium px-1.5 py-0.5 text-xs',
                        STATUS_STYLES[entry.status] ??
                          'bg-muted text-muted-foreground',
                      )}
                    >
                      {entry.status}
                    </span>
                  );
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
                      <DocumentActions kbName={kb.kb_name} doc={entry} />
                    </div>
                  );
                },
              },
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}

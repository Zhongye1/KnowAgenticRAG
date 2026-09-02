import {
  ArrowLeft,
  ArrowsClockwise,
  Files,
  MagnifyingGlass,
  TrashSimple,
  UploadSimple,
} from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/form';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { useNotifications } from '@/components/ui/notifications';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import {
  DOCUMENTS_PAGE_SIZE,
  deleteDocumentById,
  DOCUMENTS_QUERY_KEY,
  getDocumentDownloadUrl,
  useDocuments,
} from '../../api/documents';
import { useKnowledgeBaseFacets } from '../../api/knowledge-bases';
import type { DocumentItem, KnowledgeBase } from '../../api/types';
import { KnowledgeEmptyState } from '../shared/knowledge-empty-state';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_META,
} from '../../utils/document-policy';
import { DocumentDetailDrawer } from './documents/document-detail-drawer';
import { DocumentFacets } from './documents/document-facets';
import { DocumentListPagination } from './documents/document-list-pagination';
import {
  DocumentListTable,
  type DocumentRow,
} from './documents/document-list-table';
import { DocumentUploadDialog } from './documents/document-upload-dialog';
import {
  buildDocumentPollSignature,
  useDocumentPolling,
} from '../../hooks/use-document-polling';

type KnowledgeDocumentsProps = {
  kb: KnowledgeBase;
  /** 可选：文档详情页的返回入口（列表页内联面板不再使用） */
  onBack?: () => void;
};

export function KnowledgeDocuments({ kb, onBack }: KnowledgeDocumentsProps) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(DOCUMENTS_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailDoc, setDetailDoc] = useState<DocumentItem | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const clearPage = () => {
    if (searchParams.get('page')) {
      setSearchParams({}, { replace: true });
    }
  };

  const handlePageChange = (nextPage: number) => {
    setSearchParams(nextPage > 1 ? { page: String(nextPage) } : {});
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setSearchParams({}, { replace: true });
  };

  // 搜索词 300ms 防抖
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(keyword.trim());
      if (keyword.trim() !== query) clearPage();
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  // 切换知识库时重置分页与选中
  useEffect(() => {
    clearPage();
    setSelectedIds(new Set());
    setDetailDoc(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kb.kb_name]);

  const documentsQuery = useDocuments(kb.kb_name, {
    params: {
      query: query || undefined,
      sourceType: sourceType ?? undefined,
      status: status ?? undefined,
      page,
      size: pageSize,
    },
  });
  const facetsQuery = useKnowledgeBaseFacets(kb.kb_name);

  const rows = useMemo<DocumentRow[]>(
    () =>
      (documentsQuery.data?.items ?? []).map((doc) => ({
        ...doc,
        id: doc.document_id,
        createdAt: Date.parse(doc.created_time) || Date.now(),
      })),
    [documentsQuery.data],
  );
  const total = documentsQuery.data?.total ?? 0;
  const totalPages = Math.max(
    1,
    documentsQuery.data?.total_pages ?? Math.ceil(total / pageSize),
  );

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

  const toggleSelect = (documentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  };

  const togglePage = (documentIds: string[]) => {
    setSelectedIds(() => new Set(documentIds));
  };

  const handleBatchDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBatchDeleting(true);
    let success = 0;
    for (const documentId of ids) {
      try {
        await deleteDocumentById({ document_id: documentId });
        success += 1;
      } catch {
        // 单个失败不阻断批量流程，结尾统一提示
      }
    }
    setBatchDeleting(false);
    setBatchDeleteOpen(false);
    setSelectedIds(new Set());
    void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['knowledge_bases'] });
    addNotification({
      type: success === ids.length ? 'success' : 'warning',
      title: '批量删除完成',
      message: `成功 ${success} 个，失败 ${ids.length - success} 个`,
    });
  };

  // 详情文档被删除/刷新消失时自动关闭抽屉
  useEffect(() => {
    if (
      detailDoc &&
      !rows.some((row) => row.document_id === detailDoc.document_id)
    ) {
      setDetailDoc(null);
    }
  }, [rows, detailDoc]);

  const processingSignature = buildDocumentPollSignature(rows);
  useDocumentPolling({
    enabled: processingSignature.length > 0,
    signature: processingSignature,
  });

  const sourceTypeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const facet of facetsQuery.data ?? []) {
      if (facet.field === 'source_type') values.add(facet.value);
    }
    return [...values];
  }, [facetsQuery.data]);

  const hasFilter = Boolean(query || sourceType || status);
  const emptyTitle = hasFilter ? '未找到匹配的文档' : '还没有文档';
  const emptyDescription = hasFilter
    ? '换个关键词或筛选条件试试，或清空筛选查看全部文档。'
    : '上传第一个文档，文件将进入对象存储并等待摄取。';

  return (
    <section
      data-slot="knowledge-documents-panel"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden pt-2 pb-4"
    >
      <div className="flex shrink-0 items-center justify-between mb-2">
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
          <div className="min-w-0 truncate text-xl font-medium text-foreground">
            {kb.display_name}
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
              {kb.kb_name}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label="刷新文档列表"
            title="刷新"
            disabled={documentsQuery.isFetching}
            onClick={() => void documentsQuery.refetch()}
          >
            <ArrowsClockwise
              className={cn(
                'size-4',
                documentsQuery.isFetching && 'animate-spin',
              )}
            />
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <UploadSimple className="size-4" />
            上传文档
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {/* 筛选与批量操作 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-64">
            <MagnifyingGlass
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={keyword}
              placeholder="搜索文档名称或 ID"
              className="pl-8"
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>

          <NativeSelect
            aria-label="按来源类型筛选"
            value={sourceType ?? 'all'}
            onChange={(event) => {
              const value = event.target.value;
              setSourceType(value === 'all' ? null : value);
              clearPage();
            }}
          >
            <NativeSelectOption value="all">全部来源</NativeSelectOption>
            {sourceTypeOptions.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {value}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <NativeSelect
            aria-label="按状态筛选"
            value={status ?? 'all'}
            onChange={(event) => {
              const value = event.target.value;
              setStatus(value === 'all' ? null : value);
              clearPage();
            }}
          >
            <NativeSelectOption value="all">全部状态</NativeSelectOption>
            {DOCUMENT_STATUSES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {DOCUMENT_STATUS_META[value].label}
              </NativeSelectOption>
            ))}
          </NativeSelect>

          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            共 {total} 个文档
          </span>
        </div>

        {selectedIds.size > 0 ? (
          <div className="flex items-center gap-2 rounded-medium bg-primary-6/5 px-3 py-1.5">
            <span className="text-xs text-muted-foreground">
              已选 {selectedIds.size} 个文档
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelectedIds(new Set())}
            >
              取消选择
            </Button>
            <Button
              variant="destructive"
              size="xs"
              className="ml-auto"
              disabled={batchDeleting}
              onClick={() => setBatchDeleteOpen(true)}
            >
              <TrashSimple className="size-3.5" />
              {batchDeleting ? '删除中…' : '批量删除'}
            </Button>
          </div>
        ) : null}

        {documentsQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center py-10">
            <Spinner />
          </div>
        ) : documentsQuery.isError ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <KnowledgeEmptyState
              icon={<Files className="size-6" />}
              title="文档列表加载失败"
              description="请确认服务与对象存储可用后重试。"
            >
              <Button size="sm" onClick={() => void documentsQuery.refetch()}>
                重试
              </Button>
            </KnowledgeEmptyState>
          </div>
        ) : total === 0 ? (
          <div className="flex flex-1 items-center justify-center py-2">
            <KnowledgeEmptyState
              icon={<Files className="size-6" />}
              title={emptyTitle}
              description={emptyDescription}
            >
              {!hasFilter ? (
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  <UploadSimple className="size-4" />
                  上传第一个文档
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setKeyword('');
                    setQuery('');
                    setSourceType(null);
                    setStatus(null);
                    clearPage();
                  }}
                >
                  清空筛选
                </Button>
              )}
            </KnowledgeEmptyState>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <KnowledgeEmptyState
              icon={<Files className="size-6" />}
              title="当前页没有数据"
              description="可能已翻到最后一页之外，回到第一页查看。"
            >
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSearchParams({}, { replace: true });
                }}
              >
                回到第一页
              </Button>
            </KnowledgeEmptyState>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <DocumentFacets
                facets={facetsQuery.data}
                sourceType={sourceType}
                status={status}
                total={kb.documents ?? total}
                onToggleSourceType={(value) => {
                  setSourceType((prev) => (prev === value ? null : value));
                  clearPage();
                }}
                onToggleStatus={(value) => {
                  setStatus((prev) => (prev === value ? null : value));
                  clearPage();
                }}
                onReset={() => {
                  setSourceType(null);
                  setStatus(null);
                  clearPage();
                }}
              />
            </aside>
            <DocumentListTable
              kbName={kb.kb_name}
              rows={rows}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onTogglePage={togglePage}
              onOpenDetail={setDetailDoc}
              onDownload={(documentId) => void handleDownload(documentId)}
              isDeleting={batchDeleting}
            />
          </div>
        )}
      </div>

      {rows.length > 0 ? (
        <div className="flex shrink-0 items-center justify-end pt-2">
          <DocumentListPagination
            currentPage={page}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      ) : null}

      {uploadOpen ? (
        <DocumentUploadDialog
          kbName={kb.kb_name}
          onClose={() => setUploadOpen(false)}
        />
      ) : null}

      <DocumentDetailDrawer
        doc={detailDoc}
        kbName={kb.kb_name}
        onOpenChange={(open) => {
          if (!open) setDetailDoc(null);
        }}
      />

      <Dialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量删除文档</DialogTitle>
            <DialogDescription>
              确定删除选中的 {selectedIds.size}{' '}
              个文档？将同时清理对象存储文件与关联登记。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                取消
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              disabled={batchDeleting}
              onClick={() => void handleBatchDelete()}
            >
              {batchDeleting ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

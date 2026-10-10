/**
 * 知识库详情页。
 *
 * 顶部名称/类型/描述与统计卡，下面按 tab 分区：六个分区（文件管理、检索测试、知识图谱、
 * 知识导图、RAG 评估、评估基准）与头部的「共享设置」。
 *
 * 只有文档型知识库（按 `kb_type === 'milvus'` 判定）才有文件管理：连接器类型
 * （Dify / Notion）没有文档全文接口，渲染出来只会收到 400 与一个永远失败的重试按钮。
 */
import * as React from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Share2 } from 'lucide-react';

import type {
  FileView,
  KnowledgeFileSearchItem,
} from '@/features/knowledge-base';
import {
  buildSearchHitLocation,
  describeShareConfig,
  FileSearchModal,
  openLocation,
  QueryTestPanel,
  ShareConfigDialog,
  formatBytes,
  formatCount,
  getKbTypeLabel,
  KnowledgeFileTable,
  KnowledgeGraphPanel,
  KnowledgeMindmapPanel,
  EvaluationBenchmarksPanel,
  RagEvaluationPanel,
  useKnowledgeBase,
} from '@/features/knowledge-base';
import { paths } from '@/shared/config';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ContentLayout } from '@/shared/ui/content-layout';
import { PagePlaceholder } from '@/shared/ui/page-placeholder';
import { Spinner } from '@/shared/ui/spinner';

type DetailTab =
  'files' | 'query' | 'graph' | 'mindmap' | 'evaluation' | 'benchmarks';

/** 文档型知识库才有文件管理；当前按 `kb_type === 'milvus'` 判定。 */
const DOCUMENT_KB_TYPES = ['milvus'];

const DOCUMENT_TABS: Array<{
  key: DetailTab;
  label: string;
}> = [
  { key: 'files', label: '文件管理' },
  { key: 'query', label: '检索测试' },
  { key: 'graph', label: '知识图谱' },
  { key: 'mindmap', label: '知识导图' },
  { key: 'evaluation', label: 'RAG 评估' },
  { key: 'benchmarks', label: '评估基准' },
];

/** 连接器类型只支持检索测试。 */
const CONNECTOR_TABS: Array<{
  key: DetailTab;
  label: string;
}> = [{ key: 'query', label: '检索测试' }];

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-large border border-color-border-1 bg-color-bg-1 px-3 py-2">
    <p className="text-xs text-color-text-3">{label}</p>
    <p className="text-sm text-color-text-1">{value}</p>
  </div>
);

export const KnowledgeBasePage = () => {
  const { kbId } = useParams<{ kbId: string }>();

  // 换知识库时重挂载内容：目录位置与筛选状态都属于某一条知识库
  if (!kbId) {
    return (
      <PagePlaceholder title="知识库" description="地址里缺少知识库 ID。" />
    );
  }

  return <KnowledgeBaseContent key={kbId} kbId={kbId} />;
};

const KnowledgeBaseContent = ({ kbId }: { kbId: string }) => {
  const database = useKnowledgeBase(kbId);
  const [activeTab, setActiveTab] = React.useState<DetailTab>('files');
  const [view, setView] = React.useState<FileView>(() =>
    openLocation({ parentId: null, pathPrefix: '', crumbs: [] }),
  );
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);

  if (database.isPending) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-color-text-3">
        <Spinner aria-hidden className="size-4" />
        正在加载知识库…
      </p>
    );
  }

  if (database.isError || !database.data) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert" className="text-sm text-danger-6">
          {database.error instanceof Error
            ? database.error.message
            : '加载知识库失败。'}
        </p>
        <Button type="button" variant="outline" asChild>
          <Link to={paths.app.extensions.getHref()}>返回知识库列表</Link>
        </Button>
      </div>
    );
  }

  const kb = database.data;
  const stats = kb.stats;
  // 详情响应总会下发 can_manage（后端按资源权限算），缺失按只读是防御性默认：
  // 写入口由它决定，S3.3 起要挡批量与上传
  const readOnly = kb.can_manage !== true;
  const supportsDocuments = DOCUMENT_KB_TYPES.includes(
    String(kb.kb_type ?? '').toLowerCase(),
  );
  const tabs = supportsDocuments ? DOCUMENT_TABS : CONNECTOR_TABS;
  const visibleTab = supportsDocuments ? activeTab : 'query';

  /**
   * 搜索命中后回到它所在的目录，由表格里的文件名入口打开详情。
   *
   * 位置由 `buildSearchHitLocation` 从命中项的完整路径推导，状态筛选归位，
   * 否则跨目录查询会忽略这个位置。
   */
  const onSearchSelect = (file: KnowledgeFileSearchItem) => {
    setView(openLocation(buildSearchHitLocation(file)));
  };

  return (
    <ContentLayout title={kb.name}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-large border border-color-border-1 bg-color-bg-1 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon-sm" asChild>
                  <Link
                    to={paths.app.extensions.getHref()}
                    aria-label="返回知识库列表"
                  >
                    <ArrowLeft className="size-4" />
                  </Link>
                </Button>
                <h2 className="truncate text-base font-medium text-color-text-1">
                  {kb.name}
                </h2>
                <Badge variant="secondary">{getKbTypeLabel(kb.kb_type)}</Badge>
                {readOnly ? <Badge variant="outline">只读</Badge> : null}
                <span className="text-xs text-color-text-3">
                  {describeShareConfig(kb.share_config).label}
                </span>
              </span>
              <p className="text-xs text-color-text-3">
                {kb.description || '暂无描述'}
              </p>
            </div>
            {readOnly ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="size-4" aria-hidden />
                共享设置
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard
              label="待解析"
              value={formatCount(stats.pending_parse_count)}
            />
            <StatCard
              label="待入库"
              value={formatCount(stats.pending_index_count)}
            />
            <StatCard
              label="处理中"
              value={formatCount(stats.processing_count)}
            />
            <StatCard label="文件数" value={formatCount(stats.file_count)} />
            <StatCard label="大小" value={formatBytes(stats.total_size)} />
            <StatCard label="分块" value={formatCount(stats.chunk_count)} />
            <StatCard label="Tokens" value={formatCount(stats.token_count)} />
          </div>
        </div>

        <nav
          className="flex flex-wrap gap-1 border-b border-color-border-1"
          aria-label="知识库分区切换"
        >
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              type="button"
              variant="ghost"
              className="rounded-b-none"
              aria-current={tab.key === visibleTab ? 'page' : undefined}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </nav>

        {supportsDocuments ? (
          // 文件分区保持挂载：每页条数与排序是表格自持的显示偏好，
          // 切走再回来应当还在，重建会把它们重置成默认值
          <div className={visibleTab === 'files' ? undefined : 'hidden'}>
            <KnowledgeFileTable
              kbId={kbId}
              view={view}
              onViewChange={setView}
              onOpenSearch={() => setSearchOpen(true)}
              readOnly={readOnly}
            />
          </div>
        ) : null}

        {visibleTab === 'query' ? <QueryTestPanel kbId={kbId} /> : null}

        {visibleTab === 'graph' ? (
          <KnowledgeGraphPanel kbId={kbId} readOnly={readOnly} />
        ) : null}

        {visibleTab === 'mindmap' ? (
          <KnowledgeMindmapPanel kbId={kbId} readOnly={readOnly} />
        ) : null}

        {visibleTab === 'benchmarks' ? (
          <EvaluationBenchmarksPanel kbId={kbId} readOnly={readOnly} />
        ) : null}

        {visibleTab === 'evaluation' ? (
          <RagEvaluationPanel
            kbId={kbId}
            readOnly={readOnly}
            onGoToBenchmarks={() => setActiveTab('benchmarks')}
          />
        ) : null}

        {shareOpen ? (
          <ShareConfigDialog kb={kb} onOpenChange={setShareOpen} />
        ) : null}

        {searchOpen ? (
          <FileSearchModal
            kbId={kbId}
            open={searchOpen}
            onOpenChange={setSearchOpen}
            onSelect={onSearchSelect}
          />
        ) : null}
      </div>
    </ContentLayout>
  );
};

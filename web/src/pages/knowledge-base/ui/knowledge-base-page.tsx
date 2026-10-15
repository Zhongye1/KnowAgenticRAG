/** 知识库详情页。 */
import * as React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Copy,
  Database,
  FileText,
  Map as MapIcon,
  Network,
  Pencil,
  Search,
  Share2,
} from 'lucide-react';

import { useQueryClient } from '@tanstack/react-query';
import { Button, Tabs, Tag } from 'antd';

import type { LucideIcon } from 'lucide-react';

import type {
  FileView,
  KnowledgeBase,
  KnowledgeFileSearchItem,
} from '@/features/knowledge-base';
import {
  buildSearchHitLocation,
  describeShareConfig,
  FileSearchModal,
  formatCount,
  getKbTypeLabel,
  KnowledgeFileTable,
  KnowledgeFormDialog,
  KnowledgeGraphPanel,
  KnowledgeMindmapPanel,
  EvaluationBenchmarksPanel,
  knowledgeKeys,
  openLocation,
  QueryTestPanel,
  RagEvaluationPanel,
  ShareConfigDialog,
  useAutoSampleQuestions,
  useKnowledgeBase,
} from '@/features/knowledge-base';
import { paths } from '@/shared/config';
import { ContentLayout } from '@/shared/ui/content-layout';
import { useNotifications } from '@/shared/ui/notifications';
import { PagePlaceholder } from '@/shared/ui/page-placeholder';
import { Spinner } from '@/shared/ui/spinner';

import styles from './knowledge-base-page.module.css';

/* ──────────────────────────── 分区表与可见性 ──────────────────────────── */

type DetailTab =
  'files' | 'query' | 'graph' | 'mindmap' | 'evaluation' | 'benchmarks';

type DetailTabDef = { key: DetailTab; label: string; icon: LucideIcon };

/** 文档型知识库才有文件管理；当前按 `kb_type === 'milvus'` 判定。 */
const DOCUMENT_KB_TYPES = ['milvus'];

const DOCUMENT_TABS: DetailTabDef[] = [
  { key: 'files', label: '文件管理', icon: FileText },
  { key: 'query', label: '检索测试', icon: Search },
  { key: 'graph', label: '知识图谱', icon: Network },
  { key: 'mindmap', label: '知识导图', icon: MapIcon },
  { key: 'evaluation', label: 'RAG 评估', icon: BarChart3 },
  { key: 'benchmarks', label: '评估基准', icon: ClipboardList },
];

/** 连接器类型只支持检索测试。 */
const CONNECTOR_TABS: DetailTabDef[] = [
  { key: 'query', label: '检索测试', icon: Search },
];

/** 非管理员可见的分区。 */
const READONLY_VISIBLE_TABS: DetailTab[] = [
  'files',
  'query',
  'graph',
  'mindmap',
];

/* ────────────────────────── 第一层：headnav ────────────────────────── */

/** 类型图标：milvus → DatabaseZap，兜底 Database；不引品牌图标。 */
const TYPE_ICONS: Record<string, LucideIcon> = { milvus: Database };

const getTypeIcon = (type: unknown): LucideIcon =>
  TYPE_ICONS[String(type ?? '').toLowerCase()] ?? Database;

/** 复制知识库 ID。 */
const copyDatabaseId = async (
  kbId: string,
  notify: (input: { type: 'success' | 'error'; title: string }) => void,
) => {
  try {
    await navigator.clipboard.writeText(kbId);
    notify({ type: 'success', title: '知识库ID已复制到剪贴板' });
  } catch {
    notify({ type: 'error', title: '复制失败，请手动选择 ID。' });
  }
};

/** 副标题：有描述给描述，否则「{类型} 知识库 · {N} 文件」（连接器是「{类型} 连接器」）。 */
const describeSubtitle = (kb: KnowledgeBase): string => {
  const description = kb.description?.trim();
  if (description) return description;

  const typeLabel = getKbTypeLabel(kb.kb_type);
  if (!DOCUMENT_KB_TYPES.includes(String(kb.kb_type ?? '').toLowerCase())) {
    return `${typeLabel} 连接器`;
  }

  return `${typeLabel} 知识库 · ${formatCount(kb.stats.file_count)} 文件`;
};

type DetailTopBarProps = {
  kb: KnowledgeBase;
  readOnly: boolean;
  onBack: () => void;
  onShare: () => void;
  onEdit: () => void;
};

/** 详情页头：底边框页头行，与 `PageHeader` 同形态，收在 ContentLayout 的标准留白里。 */
const DetailTopBar = ({
  kb,
  readOnly,
  onBack,
  onShare,
  onEdit,
}: DetailTopBarProps) => {
  const { addNotification } = useNotifications();

  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-[var(--gray-100)] py-[7px]">
      <Button
        htmlType="button"
        type="text"
        className="rounded-[6px] px-2 py-1 text-sm text-[var(--gray-500)] outline-none hover:bg-[var(--gray-50)] hover:text-[var(--gray-700)]"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" aria-hidden />
        返回
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-[8px] border border-[var(--gray-150)] bg-[var(--main-30)] text-[var(--main-color)]"
          aria-hidden
        >
          {React.createElement(getTypeIcon(kb.kb_type), {
            className: 'size-4.5',
            'aria-hidden': true,
          })}
        </span>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <h2 className="m-0 truncate text-base font-semibold text-[var(--gray-900)]">
              {kb.name}
            </h2>
            <Tag>{getKbTypeLabel(kb.kb_type)}</Tag>
            {readOnly ? <Tag>只读</Tag> : null}
          </div>
          <span className="flex min-w-0 items-center gap-2 text-xs text-[var(--gray-500)]">
            <span className="truncate">{describeSubtitle(kb)}</span>
            <span className="shrink-0">
              {describeShareConfig(kb.share_config).label}
            </span>
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-center">
        <Button
          htmlType="button"
          variant="outlined"

          onClick={() => void copyDatabaseId(kb.kb_id, addNotification)}
        >
          <Copy className="size-3.5" aria-hidden />
          复制 ID
        </Button>
        {readOnly ? null : (
          <>
            <Button
              htmlType="button"
              variant="outlined"

              onClick={onShare}
            >
              <Share2 className="size-3.5" aria-hidden />
              共享设置
            </Button>
            <Button
              htmlType="button"
              type="primary"
              className="text-color-white shadow-none"
              onClick={onEdit}
            >
              <Pencil className="size-3.5" aria-hidden />
              配置
            </Button>
          </>
        )}
      </div>
    </header>
  );
};

/* ────────────────────────── 第二层：分区条 ────────────────────────── */

type KnowledgeBaseTabsProps = {
  /** 已按类型与权限过滤的分区表；未列出的分区不会挂载面板。 */
  tabs: ReadonlyArray<DetailTabDef>;
  value: DetailTab;
  onChange: (key: DetailTab) => void;
  /** 分区 key 到面板内容的映射，作为 `items[].children`。 */
  panels: Record<DetailTab, React.ReactNode>;
};

/**
 * 分区切换用 antd `Tabs`：键盘导航、tablist/tab 语义与面板挂载策略都由它承担。
 *
 * 未激活的面板默认保留在 DOM 里（不销毁），因此文件表的每页条数与排序这类
 * 自持偏好切走再回来还在。面板容器与条同属这一个部件，所以本页不会出现
 * 「条与内容各自渲染」的半条链结构。
 */
const KnowledgeBaseTabs = ({
  tabs,
  value,
  onChange,
  panels,
}: KnowledgeBaseTabsProps) => (
  <Tabs
    className={styles.tabBar}
    activeKey={value}
    onChange={(key) => onChange(key as DetailTab)}
    tabBarGutter={6}
    items={tabs.map((tab) => {
      const Icon = tab.icon;
      return {
        key: tab.key,
        label: tab.label,
        icon: <Icon className="size-[17px] shrink-0" aria-hidden />,
        children: panels[tab.key],
      };
    })}
  />
);

/* ─────────────────────────── 第三层：页面 ─────────────────────────── */

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<DetailTab>('files');
  const [view, setView] = React.useState<FileView>(() =>
    openLocation({ parentId: null, pathPrefix: '', crumbs: [] }),
  );
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const database = useKnowledgeBase(kbId);

  /** `?action=edit` 深链：详情就绪后打开配置弹窗，并把参数消费掉，否则关掉弹窗后刷新或回退会再弹一次。 */
  React.useEffect(() => {
    if (searchParams.get('action') !== 'edit' || !database.data) return;
    setEditOpen(true);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('action');
        return next;
      },
      { replace: true },
    );
  }, [database.data, searchParams, setSearchParams]);

  /*
   * 示例问题的自动生成/清空挂在页面这一层：分区没激活时面板不会挂载，放在面板里就只有在
   * 用户点开过检索测试分区之后才会生效。
   */
  useAutoSampleQuestions(kbId, {
    canManage: database.data?.can_manage === true,
  });

  if (database.isPending) {
    return (
      <ContentLayout title="知识库">
        <Spinner />
      </ContentLayout>
    );
  }

  if (database.isError || !database.data) {
    return (
      <ContentLayout title="知识库">
        <div className="flex flex-col items-start gap-2 py-6">
          <p role="alert" className="text-sm text-danger-6">
            {database.error instanceof Error
              ? database.error.message
              : '加载知识库失败。'}
          </p>
          <Button
            htmlType="button"
            variant="outlined"
            onClick={() => void database.refetch()}
          >
            重试
          </Button>
          <Button
            htmlType="button"
            variant="outlined"
            onClick={() => navigate(paths.app.extensions.getHref())}
          >
            返回列表
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const kb = database.data;
  const readOnly = kb.can_manage !== true;
  const supportsDocuments = DOCUMENT_KB_TYPES.includes(
    String(kb.kb_type ?? '').toLowerCase(),
  );
  const tabs = supportsDocuments ? DOCUMENT_TABS : CONNECTOR_TABS;
  const visibleTabs = readOnly
    ? tabs.filter((tab) => READONLY_VISIBLE_TABS.includes(tab.key))
    : tabs;
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

  /**
   * 第三层的内容：各分区的面板。写成映射而不是条件渲染：`Tabs` 的
   * `items[].children` 需要它，且只创建元素不挂载——真正的挂载由 `Tabs` 决定
   * （默认只在首次激活后保留，不销毁）。
   */
  const panels: Record<DetailTab, React.ReactNode> = {
    files: supportsDocuments ? (
      <KnowledgeFileTable
        kbId={kbId}
        view={view}
        onViewChange={setView}
        onOpenSearch={() => setSearchOpen(true)}
        readOnly={readOnly}
      />
    ) : null,
    query: <QueryTestPanel kbId={kbId} readOnly={readOnly} />,
    graph: (
      <KnowledgeGraphPanel
        kbId={kbId}
        readOnly={readOnly}
        active={visibleTab === 'graph'}
      />
    ),
    mindmap: (
      <KnowledgeMindmapPanel
        kbId={kbId}
        readOnly={readOnly}
        active={visibleTab === 'mindmap'}
      />
    ),
    benchmarks: <EvaluationBenchmarksPanel kbId={kbId} readOnly={readOnly} />,
    evaluation: (
      <RagEvaluationPanel
        kbId={kbId}
        readOnly={readOnly}
        active={visibleTab === 'evaluation'}
        onGoToBenchmarks={() => setActiveTab('benchmarks')}
      />
    ),
  };

  return (
    <ContentLayout title={kb.name}>
      <div className="flex flex-col gap-4">
        <DetailTopBar
          kb={kb}
          readOnly={readOnly}
          onBack={() => navigate(paths.app.extensions.getHref('knowledge'))}
          onShare={() => setShareOpen(true)}
          onEdit={() => setEditOpen(true)}
        />

        <KnowledgeBaseTabs
          tabs={visibleTabs}
          value={visibleTab}
          onChange={setActiveTab}
          panels={panels}
        />

        {editOpen ? (
          <KnowledgeFormDialog
            open
            database={kb}
            onOpenChange={(open) => {
              setEditOpen(open);
              if (!open) {
                // 名称/描述可能变了：详情页的头部直接吃缓存，让详情查询重新取一次
                void queryClient.invalidateQueries({
                  queryKey: knowledgeKeys.detail(kbId),
                });
              }
            }}
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

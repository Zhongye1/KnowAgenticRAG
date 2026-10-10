/**
 * 全局会话搜索。
 *
 * 防抖 240ms、每页 20 条、滚到底加载更多、请求序号丢弃过期响应、↑/↓ 循环选择、Enter 打开、
 * Esc 关闭、未输入时显示「新对话 + 最近会话」。搜索范围是当前用户的全部会话，不按智能体过滤。
 *
 * 三处实现取舍：搜索失败给出文案与重试按钮（与「没有结果」可区分）；状态重置放在关闭路径
 * 而不是打开时（避免在 effect 里同步 setState 多渲染一轮）；防抖在定时器回调里发起请求。
 */
import * as React from 'react';
import { MessageCircle, MessageCirclePlus, Search } from 'lucide-react';

import type { ChatThread, ThreadSearchItem } from '../api/agent-api';
import { chatThreadApi } from '../api/agent-api';
import {
  CONVERSATION_SEARCH_LIMIT,
  formatResultDate,
  getResultSnippet,
  groupRecentThreads,
  splitSnippet,
} from '../lib/search-result';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

/** 防抖时长。 */
const SEARCH_DEBOUNCE_MS = 240;
/** 距底部多少像素触发加载更多。 */
const LOAD_MORE_THRESHOLD_PX = 80;

type GlobalSearchModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 默认视图里的最近会话；由侧边栏传入已有的线程列表。 */
  recentThreads: ChatThread[];
  /** 选中一条会话；传 null 表示「新对话」。 */
  onSelectThread: (thread: ChatThread | null) => void;
};

type SearchStatus = 'idle' | 'searching' | 'loading-more' | 'error';

/** 可被键盘选中的行。 */
type ActionRow =
  | { kind: 'new' }
  | { kind: 'thread'; thread: ChatThread }
  | { kind: 'result'; item: ThreadSearchItem };

/**
 * 搜索结果到线程的投影。
 *
 * 不带 `thread_status`：搜索接口的响应里它是模型默认值 `done`，带回去会把侧边栏上
 * 运行中 / 未读的标记抹掉。
 */
const toThread = (item: ThreadSearchItem): ChatThread => ({
  id: item.id,
  agent_id: item.agent_id,
  title: item.title ?? null,
  is_pinned: item.is_pinned,
  created_at: item.created_at,
  updated_at: item.updated_at,
  metadata: item.metadata ?? null,
});

export const GlobalSearchModal = ({
  open,
  onOpenChange,
  recentThreads,
  onSelectThread,
}: GlobalSearchModalProps) => {
  const [query, setQuery] = React.useState('');
  /** 当前结果对应的查询词；与输入框不同表示防抖还没落地。 */
  const [activeQuery, setActiveQuery] = React.useState('');
  const [results, setResults] = React.useState<ThreadSearchItem[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [status, setStatus] = React.useState<SearchStatus>('idle');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  // 单调递增的请求序号：过期响应直接丢弃
  const requestSeqRef = React.useRef(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const trimmedQuery = query.trim();
  const isSearchMode = trimmedQuery.length > 0;
  // 输入已变但请求还没发出：这段时间按「搜索中」渲染骨架，避免闪一下旧结果
  const waitingForDebounce = trimmedQuery !== activeQuery;

  /**
   * 输入变化：立刻作废在途请求、清空旧结果并回到第一行。
   * 清空后列表进入骨架态，不会拿着旧关键词的结果去配新的高亮词。
   */
  const onQueryChange = (value: string) => {
    setQuery(value);
    requestSeqRef.current += 1;
    setActiveQuery('');
    setResults([]);
    setHasMore(false);
    setStatus('idle');
    setSelectedIndex(0);
  };

  const runSearch = React.useCallback(async (keyword: string) => {
    const requestId = (requestSeqRef.current += 1);
    setActiveQuery(keyword);
    setStatus('searching');
    try {
      const response = await chatThreadApi.searchThreads({
        query: keyword,
        limit: CONVERSATION_SEARCH_LIMIT,
      });
      if (requestSeqRef.current !== requestId) return;
      setResults(response.items ?? []);
      setHasMore(Boolean(response.has_more));
      setStatus('idle');
    } catch (error) {
      if (requestSeqRef.current !== requestId) return;
      console.warn('搜索对话失败:', error);
      setResults([]);
      setHasMore(false);
      setStatus('error');
    }
  }, []);

  /**
   * 输入变化后防抖 240ms 再发请求。
   * 请求在定时器回调里发起，不在 effect 体内同步 setState。
   */
  React.useEffect(() => {
    if (!open) return;
    const keyword = query.trim();
    if (!keyword) return;
    const timer = window.setTimeout(() => {
      void runSearch(keyword);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [open, query, runSearch]);

  /**
   * 关闭时重置全部状态：放在关闭路径而不是打开时，避免在 effect 里同步 setState 多渲染一轮。
   * 关闭必须走 `onOpenChange`（Esc、点遮罩、选中结果都走它）；父级直接改 `open`
   * 而不经过回调的关闭不会重置，调用方按受控组件的约定只经回调关闭。
   * 输入框焦点由 Radix Dialog 的自动聚焦负责。
   */
  const resetSearch = React.useCallback(() => {
    requestSeqRef.current += 1;
    setQuery('');
    setActiveQuery('');
    setResults([]);
    setHasMore(false);
    setStatus('idle');
    setSelectedIndex(0);
  }, []);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) resetSearch();
      onOpenChange(next);
    },
    [onOpenChange, resetSearch],
  );

  const loadMore = React.useCallback(async () => {
    const keyword = activeQuery;
    if (!keyword || !hasMore || status !== 'idle') return;
    const requestId = (requestSeqRef.current += 1);
    setStatus('loading-more');
    try {
      const response = await chatThreadApi.searchThreads({
        query: keyword,
        limit: CONVERSATION_SEARCH_LIMIT,
        offset: results.length,
      });
      if (requestSeqRef.current !== requestId) return;
      setResults((current) => [...current, ...(response.items ?? [])]);
      setHasMore(Boolean(response.has_more));
      setStatus('idle');
    } catch (error) {
      if (requestSeqRef.current !== requestId) return;
      console.warn('搜索对话失败:', error);
      setStatus('error');
    }
  }, [activeQuery, hasMore, results.length, status]);

  const recentRows = React.useMemo(
    () => groupRecentThreads(recentThreads),
    [recentThreads],
  );

  /** 渲染条目：分组标题不参与键盘选择，可操作行带自己的下标。 */
  const renderItems = React.useMemo(() => {
    type RenderItem =
      | { kind: 'label'; key: string; label: string }
      | { kind: 'action'; key: string; row: ActionRow; index: number };

    if (isSearchMode) {
      return results.map((item, index): RenderItem => ({
        kind: 'action',
        key: `result-${item.thread_id}`,
        row: { kind: 'result', item },
        index,
      }));
    }

    const items: RenderItem[] = [
      { kind: 'action', key: 'row-new', row: { kind: 'new' }, index: 0 },
    ];
    let index = 1;
    for (const row of recentRows) {
      if (row.type === 'label') {
        items.push({ kind: 'label', key: row.key, label: row.label });
        continue;
      }
      items.push({
        kind: 'action',
        key: `row-${row.thread.id}`,
        row: { kind: 'thread', thread: row.thread },
        index: index++,
      });
    }
    return items;
  }, [isSearchMode, recentRows, results]);

  const actionCount = isSearchMode
    ? results.length
    : 1 + recentRows.filter((row) => row.type === 'thread').length;

  // 行数变化后把选中项收进范围，避免停在越界下标上（渲染期派生，不用 effect 回写）
  const activeIndex =
    actionCount === 0 ? 0 : Math.min(selectedIndex, actionCount - 1);

  const selectRow = React.useCallback(
    (row: ActionRow | undefined) => {
      if (!row) return;
      if (row.kind === 'new') {
        onSelectThread(null);
      } else if (row.kind === 'thread') {
        onSelectThread(row.thread);
      } else {
        onSelectThread(toThread(row.item));
      }
      handleOpenChange(false);
    },
    [handleOpenChange, onSelectThread],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (actionCount === 0) return;
      const next =
        event.key === 'ArrowDown' ? activeIndex + 1 : activeIndex - 1;
      setSelectedIndex((next + actionCount) % actionCount);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const row = renderItems.find(
        (item) => item.kind === 'action' && item.index === activeIndex,
      );
      selectRow(row?.kind === 'action' ? row.row : undefined);
      return;
    }
  };

  // 键盘移动选中项后把它滚进可视区
  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  const onListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const distanceToBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom <= LOAD_MORE_THRESHOLD_PX) void loadMore();
  };

  const showSkeleton =
    isSearchMode &&
    results.length === 0 &&
    (waitingForDebounce || status === 'searching');

  const renderRow = (row: ActionRow, index: number) => {
    const selected = index === activeIndex;
    const highlight = 'bg-sidebar-accent text-sidebar-accent-foreground';

    if (row.kind === 'new') {
      return (
        <button
          type="button"
          data-row-index={index}
          className={`flex w-full items-center gap-2 rounded-medium px-2 py-2 text-left text-sm ${selected ? highlight : 'text-color-text-2'}`}
          aria-current={selected ? 'true' : undefined}
          onMouseEnter={() => setSelectedIndex(index)}
          onClick={() => selectRow(row)}
        >
          <MessageCirclePlus className="size-4 shrink-0" aria-hidden />
          新对话
        </button>
      );
    }

    const thread = row.kind === 'thread' ? row.thread : toThread(row.item);
    const snippet = row.kind === 'result' ? getResultSnippet(row.item) : '';
    const date = formatResultDate(
      row.kind === 'result'
        ? (row.item.latest_match_at ?? row.item.updated_at)
        : (thread.updated_at ?? thread.created_at),
    );

    return (
      <button
        type="button"
        data-row-index={index}
        className={`flex w-full flex-col gap-1 rounded-medium px-2 py-2 text-left ${selected ? highlight : 'text-color-text-2'}`}
        aria-current={selected ? 'true' : undefined}
        onMouseEnter={() => setSelectedIndex(index)}
        onClick={() => selectRow(row)}
      >
        <span className="flex items-center gap-2">
          <MessageCircle className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm">
            {thread.title || '新的对话'}
          </span>
          <span className="shrink-0 text-xs text-color-text-3">{date}</span>
        </span>
        {snippet ? (
          <span className="line-clamp-2 text-xs text-color-text-3">
            {splitSnippet(snippet, trimmedQuery).map((segment, segmentIndex) =>
              segment.match ? (
                <mark
                  key={segmentIndex}
                  className="bg-transparent text-primary-6"
                >
                  {segment.text}
                </mark>
              ) : (
                <React.Fragment key={segmentIndex}>
                  {segment.text}
                </React.Fragment>
              ),
            )}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-xl gap-2 p-0"
        onKeyDown={onKeyDown}
        data-testid="global-search-modal"
      >
        <DialogTitle className="sr-only">搜索会话</DialogTitle>
        <DialogDescription className="sr-only">
          按消息内容搜索历史会话，↑↓ 选择，回车打开。
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-color-border-1 px-3 py-2">
          <Search className="size-4 shrink-0 text-color-text-3" aria-hidden />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索历史会话"
            aria-label="搜索历史会话"
            className="border-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div
          ref={listRef}
          className="max-h-[60vh] min-h-24 overflow-y-auto px-2 pb-2"
          onScroll={onListScroll}
          data-testid="global-search-results"
        >
          {status === 'error' ? (
            <div className="flex flex-col items-center gap-2 py-6 text-sm text-color-text-3">
              <span>搜索失败，请重试。</span>
              <button
                type="button"
                className="rounded-medium border border-color-border-1 px-3 py-1 text-color-text-1"
                onClick={() => {
                  if (activeQuery) void runSearch(activeQuery);
                }}
              >
                重试
              </button>
            </div>
          ) : null}

          {status !== 'error' && showSkeleton
            ? Array.from({ length: 5 }, (_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="mx-2 my-2 h-8 animate-pulse rounded-medium bg-color-fill-2"
                />
              ))
            : null}

          {!showSkeleton && (status !== 'error' || results.length > 0)
            ? renderItems.map((item) =>
                item.kind === 'label' ? (
                  <p
                    key={item.key}
                    className="px-2 pt-3 pb-1 text-xs text-color-text-3"
                  >
                    {item.label}
                  </p>
                ) : (
                  <React.Fragment key={item.key}>
                    {renderRow(item.row, item.index)}
                  </React.Fragment>
                ),
              )
            : null}

          {status !== 'error' &&
          !showSkeleton &&
          isSearchMode &&
          results.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-color-text-3">
              未找到相关对话
            </p>
          ) : null}

          {status !== 'error' &&
          !showSkeleton &&
          !isSearchMode &&
          recentRows.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-color-text-3">
              暂无对话历史
            </p>
          ) : null}

          {status === 'loading-more' ? (
            <p className="flex items-center justify-center gap-2 px-2 py-3 text-xs text-color-text-3">
              <Spinner aria-hidden className="size-3" />
              加载中...
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

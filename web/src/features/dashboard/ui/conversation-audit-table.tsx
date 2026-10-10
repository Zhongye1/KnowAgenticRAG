/**
 * 全平台会话审计表：用户 / 智能体 / 状态 / 关键字筛选 + 服务端分页 + 行内打开详情。
 *
 * 筛选值、页码与页长都是页面状态，但「筛选值 → 请求参数」的折算在 `lib/conversation-query.ts`：
 * 改筛选必须回第 1 页，否则会带着上一层的页码去查新条件。
 * 翻页期间 `keepPreviousData` 会保留上一页的行，因此必须同时显示加载态并禁用行入口，
 * 否则旧行会被当成新条件下的结果点开。
 */
import * as React from 'react';
import { RefreshCw, Search } from 'lucide-react';

import {
  CONVERSATION_FILTER_DEFAULTS,
  CONVERSATION_PAGE_SIZES,
  CONVERSATION_STATUS_OPTIONS,
  DEFAULT_CONVERSATION_PAGE_SIZE,
  FILTER_CHANGE_PAGE,
  buildConversationQuery,
  conversationPageCount,
  conversationStatusLabel,
  hasActiveConversationFilters,
  type ConversationFilters,
} from '../lib/conversation-query';
import {
  formatFullDateTime,
  truncateIdentifier,
} from '../lib/dashboard-format';
import {
  useConversationList,
  useConversationOptions,
} from '../model/dashboard-queries';
import { PanelBody, PanelCard } from './panel-card';
import { Button } from '@/shared/ui/button';
import { Empty } from '@/shared/ui/empty';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';

/** 状态标签的配色：与设计规范的状态色表一致。 */
const STATUS_CLASSES: Record<string, string> = {
  active: 'bg-success-1 text-success-7',
  archived: 'bg-color-fill-2 text-color-text-3',
  deleted: 'bg-danger-1 text-danger-7',
  subagent: 'bg-link-1 text-link-7',
};

const StatusTag = ({ status }: { status: string }) => (
  <span
    data-testid="conversation-status"
    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
      STATUS_CLASSES[status] ?? 'bg-color-fill-2 text-color-text-3'
    }`}
  >
    {conversationStatusLabel(status)}
  </span>
);

export const ConversationAuditTable = ({
  onOpenThread,
}: {
  onOpenThread: (threadId: string) => void;
}) => {
  const [filters, setFilters] = React.useState<ConversationFilters>(
    CONVERSATION_FILTER_DEFAULTS,
  );
  /** 已提交的关键字；与输入框分离，回车或点「查询」才生效。 */
  const [submittedSearch, setSubmittedSearch] = React.useState('');
  const [page, setPage] = React.useState(FILTER_CHANGE_PAGE);
  const [pageSize, setPageSize] = React.useState(
    DEFAULT_CONVERSATION_PAGE_SIZE,
  );

  const applied: ConversationFilters = { ...filters, search: submittedSearch };
  const query = buildConversationQuery(applied, page, pageSize);
  const list = useConversationList(query);
  const options = useConversationOptions();

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pageCount = conversationPageCount(total, pageSize);
  /** 保留上一页数据期间禁止点行：表里的行可能不属于当前筛选。 */
  const stale = list.isFetching;
  const hasRows = items.length > 0;

  const applyFilterChange = (next: Partial<ConversationFilters>) => {
    setFilters((current) => ({ ...current, ...next }));
    setPage(FILTER_CHANGE_PAGE);
  };

  const submitSearch = () => {
    setSubmittedSearch(filters.search);
    setPage(FILTER_CHANGE_PAGE);
  };

  const resetFilters = () => {
    setFilters(CONVERSATION_FILTER_DEFAULTS);
    setSubmittedSearch('');
    setPage(FILTER_CHANGE_PAGE);
    setPageSize(DEFAULT_CONVERSATION_PAGE_SIZE);
  };

  return (
    <PanelCard
      title="全平台会话审计"
      description="默认排除已删除记录，可切换筛选查看完整历史"
      testId="conversation-audit"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-color-text-4"
              aria-hidden
            />
            <Input
              value={filters.search}
              aria-label="搜索会话"
              placeholder="搜索标题、Thread ID、用户名或 UID"
              className="h-8 w-[240px] pl-7 text-xs"
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitSearch();
              }}
            />
          </div>

          <Select
            value={filters.status}
            onValueChange={(value) =>
              applyFilterChange({
                status: value as ConversationFilters['status'],
              })
            }
          >
            <SelectTrigger
              aria-label="按会话状态筛选"
              className="h-8 w-[168px] text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONVERSATION_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.agentId ?? 'all'}
            onValueChange={(value) =>
              applyFilterChange({
                agentId: value === 'all' ? undefined : value,
              })
            }
          >
            <SelectTrigger
              aria-label="按智能体筛选"
              className="h-8 w-[170px] text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部智能体</SelectItem>
              {(options.data?.agents ?? []).map((agent) => (
                <SelectItem
                  key={agent.agent_id ?? ''}
                  value={agent.agent_id ?? ''}
                >
                  {agent.agent_name || agent.agent_id}
                  {agent.is_deleted ? '（已删除）' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.uid ?? 'all'}
            onValueChange={(value) =>
              applyFilterChange({ uid: value === 'all' ? undefined : value })
            }
          >
            <SelectTrigger
              aria-label="按用户筛选"
              className="h-8 w-[160px] text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部用户</SelectItem>
              {(options.data?.users ?? []).map((user) => (
                <SelectItem key={user.uid ?? ''} value={user.uid ?? ''}>
                  {user.username || user.uid}
                  {user.is_deleted ? '（已注销）' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasActiveConversationFilters(applied)}
            onClick={resetFilters}
          >
            重置
          </Button>
          <Button type="button" size="sm" onClick={submitSearch}>
            查询
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={list.isFetching}
            onClick={() => void list.refetch()}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            刷新
          </Button>
        </div>
      }
    >
      <PanelBody
        loading={list.isPending}
        error={list.isError}
        onRetry={() => void list.refetch()}
        errorText="会话列表加载失败。"
        height={240}
        testId="conversation-audit"
      >
        {!hasRows ? (
          <Empty description="没有符合当前条件的会话，可调整关键词或状态后重试。" />
        ) : (
          <div className="relative overflow-x-auto">
            {stale ? (
              <div className="absolute inset-x-0 top-0 z-10 flex justify-center bg-color-bg-1/70 py-1">
                <Spinner size="sm" className="text-color-text-3" />
              </div>
            ) : null}
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="text-color-text-3">
                <tr className="border-b border-color-border-1">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    会话标题 / ID
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    所属智能体
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    用户
                  </th>
                  <th scope="col" className="py-2 pr-3 text-center font-medium">
                    状态
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    消息数
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Token
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    更新时间
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((conversation) => (
                  <tr
                    key={conversation.thread_id}
                    data-testid="conversation-row"
                    tabIndex={0}
                    aria-label={`查看会话 ${conversation.title || conversation.thread_id} 的详情`}
                    className="cursor-pointer border-b border-color-border-1 last:border-b-0 hover:bg-color-bg-2 focus-visible:bg-color-bg-2"
                    onClick={() => {
                      if (!stale) onOpenThread(conversation.thread_id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      if (!stale) onOpenThread(conversation.thread_id);
                    }}
                  >
                    <td className="max-w-[280px] py-2 pr-3">
                      <span
                        className="block truncate text-color-text-1"
                        title={conversation.title ?? undefined}
                      >
                        {conversation.title || '未命名会话'}
                        {conversation.is_pinned ? '（置顶）' : ''}
                      </span>
                      <span
                        className="block truncate font-mono text-[10px] text-color-text-3"
                        title={conversation.thread_id}
                      >
                        {truncateIdentifier(conversation.thread_id, 12, 6)}
                      </span>
                    </td>
                    <td className="max-w-[180px] py-2 pr-3">
                      <span className="block truncate text-color-text-1">
                        {conversation.agent_name || conversation.agent_id}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-color-text-3">
                        {truncateIdentifier(conversation.agent_id)}
                      </span>
                    </td>
                    <td className="max-w-[170px] py-2 pr-3">
                      <span className="block truncate text-color-text-1">
                        {conversation.username || conversation.uid}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-color-text-3">
                        {truncateIdentifier(conversation.uid)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <StatusTag status={conversation.status} />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-color-text-2">
                      {conversation.message_count}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-color-text-2">
                      {Number(conversation.total_tokens ?? 0).toLocaleString(
                        'zh-CN',
                      )}
                    </td>
                    <td className="py-2 pr-3 text-color-text-3">
                      {formatFullDateTime(conversation.updated_at)}
                    </td>
                    <td className="py-2">
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        disabled={stale}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenThread(conversation.thread_id);
                        }}
                      >
                        查看详情
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-color-border-1 pt-3">
          <span
            className="text-xs text-color-text-3"
            data-testid="conversation-total"
          >
            共 {total} 条会话，第 {page} / {pageCount} 页
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setPage(FILTER_CHANGE_PAGE);
              }}
            >
              <SelectTrigger
                aria-label="每页条数"
                className="h-8 w-[104px] text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONVERSATION_PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} 条/页
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || stale}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pageCount || stale}
              onClick={() => setPage((current) => current + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </PanelBody>
    </PanelCard>
  );
};

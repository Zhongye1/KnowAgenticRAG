/**
 * 消息时序调试面板。
 *
 * 移植上游 `MessageDebugPanel.vue`：顶部按角色筛选（带数量）+ 关键词搜索 + 全部展开/折叠 +
 * 复制全部数据；正文按连续 run_id 分组，每条显示角色、摘要、tokens 与展开后的原始 JSON，
 * 单条可复制；有 run_id 的分组给「Langfuse」按钮，按后端返回的链接新开窗口。
 *
 * 与上游的差异：1) 上游靠 pinia store 拿数据，这里只吃 `messages` 属性；2) 上游在客户端
 * `checkSuperAdminPermission()`，本仓不复制这道门（入口只对超管显示，后端仍是最终边界）；
 * 3) 复制走 `navigator.clipboard`，失败时给出可读提示而不是静默。
 */
import * as React from 'react';
import {
  Bot,
  Bug,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FoldVertical,
  Search,
  Settings2,
  TriangleAlert,
  UnfoldVertical,
  User,
  Wrench,
} from 'lucide-react';

import {
  buildMessageDebugEntries,
  filterMessageDebugEntries,
  formatDebugTokenTooltip,
  formatDebugTokens,
  formatRunId,
  groupMessageDebugEntries,
  messageDebugFilterTabs,
  resolveLangfuseRunUrl,
  type DebugMessage,
  type MessageDebugFilter,
} from '../lib/message-debug';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

export type MessageDebugPanelProps = {
  messages: DebugMessage[];
  /** 打开某次 run 的 Langfuse 页面；返回链接或 null。 */
  fetchLangfuseUrl?: (runId: string) => Promise<unknown>;
};

const ROLE_ICONS = {
  human: User,
  ai: Bot,
  tool: Wrench,
  error: TriangleAlert,
  system: Settings2,
  other: Clock,
} as const;

const ROLE_CLASSES = {
  human: 'bg-primary-6/10 text-primary-6',
  ai: 'bg-success-6/10 text-success-6',
  tool: 'bg-color-fill-3 text-color-text-2',
  error: 'bg-danger-6/10 text-danger-6',
  system: 'bg-warning-6/10 text-warning-6',
  other: 'bg-color-fill-2 text-color-text-3',
} as const;

export const MessageDebugPanel = ({
  messages,
  fetchLangfuseUrl,
}: MessageDebugPanelProps) => {
  const [filter, setFilter] = React.useState<MessageDebugFilter>('all');
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = React.useState('');
  const [allCopied, setAllCopied] = React.useState(false);
  const [pendingRunId, setPendingRunId] = React.useState('');
  const [notice, setNotice] = React.useState('');

  const entries = React.useMemo(
    () => buildMessageDebugEntries(messages),
    [messages],
  );
  const tabs = React.useMemo(() => messageDebugFilterTabs(entries), [entries]);
  const visible = React.useMemo(
    () => filterMessageDebugEntries(entries, filter, query),
    [entries, filter, query],
  );
  const groups = React.useMemo(
    () => groupMessageDebugEntries(visible),
    [visible],
  );
  const allExpanded =
    visible.length > 0 && visible.every((item) => expanded.has(item.id));

  const toggleAll = () => {
    setExpanded(
      allExpanded ? new Set() : new Set(visible.map((item) => item.id)),
    );
  };

  const copy = async (text: string, onDone: () => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('');
      onDone();
    } catch {
      setNotice('复制失败，请检查浏览器剪贴板权限。');
    }
  };

  const openLangfuse = async (runId: string) => {
    if (!fetchLangfuseUrl) return;
    setPendingRunId(runId);
    try {
      const url = resolveLangfuseRunUrl(await fetchLangfuseUrl(runId));
      if (!url) {
        setNotice('这次 Run 没有可打开的 Langfuse 链接。');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : '打开 Langfuse 失败。',
      );
    } finally {
      setPendingRunId('');
    }
  };

  return (
    <section
      aria-label="消息时序调试"
      className="flex flex-col gap-3 rounded-large border border-color-border-1 bg-color-bg-1 p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-color-text-1">
          <Bug className="size-4" />
          消息时序调试
          <span className="rounded bg-color-fill-2 px-1.5 text-xs text-color-text-3">
            {visible.length} 条
          </span>
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            title={allExpanded ? '全部折叠' : '全部展开'}
            onClick={toggleAll}
          >
            {allExpanded ? (
              <FoldVertical className="size-3.5" />
            ) : (
              <UnfoldVertical className="size-3.5" />
            )}
            {allExpanded ? '全部折叠' : '全部展开'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void copy(
                JSON.stringify(
                  entries.map((item) => item.raw),
                  null,
                  2,
                ),
                () => setAllCopied(true),
              )
            }
          >
            {allCopied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {allCopied ? '已复制' : '复制数据'}
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="flex flex-wrap gap-1">
          <legend className="sr-only">角色筛选</legend>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={filter === tab.key}
              className={`rounded px-2 py-0.5 text-xs ${
                filter === tab.key
                  ? 'bg-primary-6/10 text-primary-6'
                  : 'bg-color-fill-2 text-color-text-3'
              }`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              {tab.count > 0 ? ` ${tab.count}` : ''}
            </button>
          ))}
        </fieldset>
        <div className="relative ml-auto w-56">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-color-text-3" />
          <Input
            aria-label="搜索消息或字段"
            className="pl-7"
            placeholder="搜索消息或字段..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {notice ? (
        <p role="alert" className="text-xs text-danger-6">
          {notice}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-1 text-sm text-color-text-3">
          <Clock className="size-5" />
          {query ? '未找到匹配的消息' : '当前会话暂无消息数据'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <section
              key={group.key}
              aria-label={group.runId ? `Run ${group.runId}` : '未关联 Run'}
              className="flex flex-col gap-1"
            >
              <header className="flex items-center gap-2 text-xs text-color-text-3">
                <span>{group.runId ? 'Run' : '未关联 Run'}</span>
                {group.runId ? (
                  <code title={group.runId}>{formatRunId(group.runId)}</code>
                ) : null}
                {group.runId && fetchLangfuseUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-1 py-0 text-xs"
                    disabled={pendingRunId === group.runId}
                    onClick={() => void openLangfuse(group.runId as string)}
                  >
                    {pendingRunId === group.runId ? (
                      <Spinner className="size-3" />
                    ) : (
                      <ExternalLink className="size-3" />
                    )}
                    Langfuse
                  </Button>
                ) : null}
                <span className="ml-auto">{group.items.length} 条</span>
              </header>

              <ul className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const Icon = ROLE_ICONS[item.role];
                  const open = expanded.has(item.id);
                  return (
                    <li
                      key={item.id}
                      className="rounded border border-color-border-1 px-2 py-1"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="size-3.5 text-color-text-3" />
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${ROLE_CLASSES[item.role]}`}
                        >
                          {item.roleLabel}
                        </span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-xs text-color-text-2"
                          title={item.summary}
                          onClick={() =>
                            setExpanded((current) => {
                              const next = new Set(current);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })
                          }
                        >
                          {item.summary}
                        </button>
                        {formatDebugTokens(item.usage) ? (
                          <span
                            className="text-xs text-color-text-3"
                            title={formatDebugTokenTooltip(item.usage)}
                          >
                            {formatDebugTokens(item.usage)}
                          </span>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label={`复制第 ${item.id} 条消息`}
                          onClick={() =>
                            void copy(JSON.stringify(item.raw, null, 2), () =>
                              setCopiedId(item.id),
                            )
                          }
                        >
                          {copiedId === item.id ? (
                            <Check className="size-3" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </Button>
                      </div>
                      {open ? (
                        <pre className="mt-1 max-h-64 overflow-auto rounded bg-color-fill-1 px-2 py-1 text-xs whitespace-pre-wrap text-color-text-1">
                          {JSON.stringify(item.raw, null, 2)}
                        </pre>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
};

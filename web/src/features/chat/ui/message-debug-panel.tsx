/**
 * 消息时序调试面板。
 *
 * 顶部按角色筛选（带数量）+ 关键词搜索 + 全部展开/折叠 + 复制全部数据；正文按连续 run_id
 * 分组，每条显示角色、摘要、tokens 与展开后的原始 JSON，单条可复制；有 run_id 的分组给
 * 「Langfuse」按钮，按后端返回的链接新开窗口。
 *
 * 只吃 `messages` 属性，不引入全局 store；入口只对超管显示，授权由后端兜底；
 * 复制走 `navigator.clipboard`，失败时给出可读提示而不是静默。
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
  GitBranch,
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
import { Spin } from 'antd';
import styles from './message-debug-panel.module.css';

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

/* 参照 .role-pill：纯文字色（只有 error 红），不做彩底 */
const ROLE_CLASSES = {
  human: styles.pillHuman,
  ai: styles.pillAi,
  tool: styles.pillHuman,
  error: styles.pillError,
  system: styles.pillSystem,
  other: styles.pillSystem,
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
      className={styles.panel}
      aria-label="消息时序调试"
      data-testid="message-debug-panel"
    >
      <div className={styles.toolbar}>
        <div className={styles.titleGroup}>
          <Bug className={styles.titleIcon} size={15} />
          <span className={styles.toolbarTitle}>消息时序调试</span>
          <span className={styles.itemCountBadge}>{messages.length} 条</span>
          <div className={styles.titleActions}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={toggleAll}
            >
              {allExpanded ? (
                <FoldVertical className="size-3.5" />
              ) : (
                <UnfoldVertical className="size-3.5" />
              )}
              {allExpanded ? '全部折叠' : '全部展开'}
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() =>
                void copy(
                  JSON.stringify(
                    messages.map((item) => item.raw),
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
            </button>
          </div>
        </div>

        <div className={styles.filterRow}>
          <fieldset className={styles.filterChips}>
            <legend className="sr-only">角色筛选</legend>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`${styles.filterChip} ${filter === tab.key ? styles.filterChipActive : ''}`}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
                <span className={styles.chipCount}>{tab.count}</span>
              </button>
            ))}
          </fieldset>
          <div className={styles.searchBox}>
            <Search className={styles.searchIcon} size={13} />
            <input
              className={styles.searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索消息或字段..."
              aria-label="搜索消息或字段"
            />
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {notice ? (
          <p role="alert" className={styles.errorLine}>
            {notice}
          </p>
        ) : null}
        {groups.length === 0 ? (
          <div className={styles.emptyState}>
            <Clock className="size-5" />
            <span>
              {query.trim() || filter !== 'all'
                ? '未找到匹配的消息'
                : '当前会话暂无消息数据'}
            </span>
          </div>
        ) : (
          groups.map((group) => (
            <section
              key={group.key}
              aria-label={group.runId ? `Run ${group.runId}` : '未关联 Run'}
              className={styles.runGroup}
            >
              <header className={styles.runGroupHeader}>
                <GitBranch className={styles.runGroupIcon} size={13} />
                <span className={styles.runGroupLabel}>
                  {group.runId ? 'Run' : '未关联 Run'}
                </span>
                {group.runId ? (
                  <code className={styles.runGroupId} title={group.runId}>
                    {formatRunId(group.runId)}
                  </code>
                ) : null}
                {group.runId && fetchLangfuseUrl ? (
                  <button
                    type="button"
                    className={styles.langfuseBtn}
                    disabled={pendingRunId === group.runId}
                    onClick={() => void openLangfuse(group.runId as string)}
                  >
                    {pendingRunId === group.runId ? (
                      <Spin className="size-3" />
                    ) : (
                      <ExternalLink className="size-3" />
                    )}
                    Langfuse
                  </button>
                ) : null}
                <span className={styles.runGroupCount}>
                  {group.items.length} 条
                </span>
              </header>

              <ul className={styles.timeline}>
                {group.items.map((item) => {
                  const Icon = ROLE_ICONS[item.role];
                  const open = expanded.has(item.id);
                  return (
                    <li
                      key={item.id}
                      className={`${styles.timelineItem} ${item.role === 'error' ? styles.timelineItemError : ''}`}
                    >
                      <div className={styles.itemHeader}>
                        <Icon className={styles.roleIcon} size={13} />
                        <span className={styles.rolePill}>
                          <span className={ROLE_CLASSES[item.role]}>
                            {item.roleLabel}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={styles.headerSummary}
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
                            className={styles.tokenBadge}
                            title={formatDebugTokenTooltip(item.usage)}
                          >
                            {formatDebugTokens(item.usage)}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className={styles.itemIconBtn}
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
                        </button>
                      </div>
                      {open ? (
                        <div className={styles.itemBody}>
                          <pre className={styles.itemJson}>
                            {JSON.stringify(item.raw, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </section>
  );
};

/**
 * 侧边栏里的会话列表。
 *
 * 参照 `ConversationNavSection.vue`：可折叠的「最近」标题、32px 会话行（悬停露出渐隐遮罩与
 * 「更多」按钮）、行状态点、置顶标记、底部的「加载更多」。
 *
 * 行的手势与参照一致：单击进入、双击重命名、中键删除，另有悬停出现的「更多」菜单
 * （置顶 / 重命名 / 删除）。
 *
 * 与参照的两处不同：
 * - 行仍是 `<Link>` 而不是 `<div>`：可聚焦、可读屏、可新标签页打开；手势挂在它上面，
 *   中键的默认行为（新标签页）被拦下。
 * - 悬停/选中的底色走本仓侧边栏的 `--sidebar-*` 调色板：参照的 `--gray-50` 在这层底色上
 *   没有对比。
 */
import * as React from 'react';
import {
  ChevronDown,
  Loader2,
  MoreVertical,
  Pin,
  PinOff,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { Button, Dropdown, Input, Modal } from 'antd';

import { useNotifications } from '@/shared/ui/notifications';
import { paths } from '@/shared/config';

import type { ChatThread } from '../api/agent-api';
import { disposeAgentStateReads } from '../model/agent-state';
import { disposeThreadRuntime } from '../model/thread-runtime-store';
import { useThreadList } from '../model/thread-list-store';

import styles from './conversation-list.module.css';

/** 标题缺省时的占位；与参照同值，也与本仓页头的「新的对话」一致。 */
const UNTITLED = '新的对话';

type ConversationListProps = {
  /** 当前路由上的会话 id，用于高亮。 */
  currentThreadId?: string;
};

const ThreadRow = ({
  thread,
  isCurrent,
}: {
  thread: ChatThread;
  isCurrent: boolean;
}) => {
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const rename = useThreadList((state) => state.rename);
  const togglePin = useThreadList((state) => state.togglePin);
  const remove = useThreadList((state) => state.remove);
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState(thread.title ?? '');
  const [confirming, setConfirming] = React.useState(false);
  const renameInputRef = React.useRef<import('antd').InputRef>(null);

  React.useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);

  const title = thread.title || UNTITLED;

  const openRename = () => {
    setDraft(thread.title ?? '');
    setRenaming(true);
  };

  const commitRename = async () => {
    const next = draft.trim();
    if (!next) {
      addNotification({
        type: 'warning',
        title: '会话',
        message: '标题不能为空',
      });
      return;
    }
    if (!(await rename(thread.id, next))) return;
    setRenaming(false);
  };

  const confirmRemove = async () => {
    setConfirming(false);
    if (!(await remove(thread.id))) return;
    // 删掉哪条都要清掉它的运行时：订阅与在途请求不该继续为已删会话工作
    disposeAgentStateReads(thread.id);
    disposeThreadRuntime(thread.id);
    if (!isCurrent) return;
    // 删掉的正是当前会话：后端随后会返回「对话线程不存在」，
    // 必须离开这个地址，否则用户停在一条已死的会话上
    navigate(paths.app.chat.getHref(), { replace: true });
  };

  return (
    /* 操作区是行的兄弟节点而不是 Link 的子节点：`<a>` 里不能放按钮，
       而且嵌进去会让点「更多」冒泡成一次导航 */
    <span className={styles.row}>
      <Link
        to={paths.app.chat.getHref(thread.id)}
        aria-current={isCurrent ? 'page' : undefined}
        className={`${styles.item} ${isCurrent ? styles.itemActive : ''}`}
        /* 双击重命名。第一次点击已经进入这条会话（与参照一致），改名弹窗随后打开 */
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openRename();
        }}
        /* 中键删除。拦下默认行为，否则浏览器会另开一个标签页 */
        onAuxClick={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          setConfirming(true);
        }}
      >
        <span className={styles.title}>{title}</span>
        <span className={styles.actionsMask} aria-hidden />

        {thread.thread_status === 'loading' ? (
          /* output 隐式带 role=status：读屏会播报状态变化，且不需要额外 role */
          <output
            className={`${styles.status} ${styles.statusLoading}`}
            aria-label="正在运行"
            title="正在运行"
          >
            <Loader2 size={12} aria-hidden />
          </output>
        ) : thread.thread_status === 'ready' ? (
          <output
            className={`${styles.status} ${styles.statusReady}`}
            aria-label="有新回复"
            title="有新回复"
          />
        ) : null}
      </Link>

      <span className={styles.actions}>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'pin',
                icon: thread.is_pinned ? (
                  <PinOff size={14} aria-hidden />
                ) : (
                  <Pin size={14} aria-hidden />
                ),
                label: thread.is_pinned ? '取消置顶' : '置顶',
              },
              {
                key: 'rename',
                icon: <SquarePen size={14} aria-hidden />,
                label: '重命名',
              },
              {
                key: 'delete',
                icon: <Trash2 size={14} aria-hidden />,
                label: '删除',
                danger: true,
              },
            ],
            onClick: ({ key }) => {
              if (key === 'pin') void togglePin(thread.id);
              if (key === 'rename') openRename();
              if (key === 'delete') setConfirming(true);
            },
          }}
        >
          <span className={styles.actionButtonWrapper}>
            <Button
              type="text"
              size="small"
              className={styles.moreButton}
              aria-label={`会话操作：${title}`}
            >
              <MoreVertical size={16} aria-hidden />
            </Button>
            {thread.is_pinned ? (
              <Pin
                className={styles.pinnedIndicator}
                size={14}
                aria-label="已置顶"
              />
            ) : null}
          </span>
        </Dropdown>
      </span>

      <Modal
        open={renaming}
        onCancel={() => setRenaming(false)}
        title="重命名对话"
        centered
        width={400}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              htmlType="button"
              variant="outlined"
              onClick={() => setRenaming(false)}
            >
              取消
            </Button>
            <Button htmlType="button" onClick={() => void commitRename()}>
              保存
            </Button>
          </div>
        }
      >
        <p className="m-0 mb-3 text-[13px] text-[var(--gray-500)]">
          保持简短且易于识别
        </p>
        <Input
          ref={renameInputRef}
          value={draft}
          aria-label="会话标题"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commitRename();
            if (event.key === 'Escape') setRenaming(false);
          }}
        />
      </Modal>

      <Modal
        open={confirming}
        onCancel={() => setConfirming(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              htmlType="button"
              variant="outlined"
              onClick={() => setConfirming(false)}
            >
              取消
            </Button>
            <Button
              htmlType="button"
              color="danger"
              variant="solid"
              onClick={() => void confirmRemove()}
            >
              删除
            </Button>
          </div>
        }
        title={
          <div>
            <div>删除会话</div>
            <div className="text-xs font-normal text-color-text-3">
              删除后这条会话不再出现在列表里，历史消息不会恢复。
            </div>
          </div>
        }
      />
    </span>
  );
};

export const ConversationList = ({
  currentThreadId,
}: ConversationListProps) => {
  const threads = useThreadList((state) => state.threads);
  const loading = useThreadList((state) => state.loading);
  const loadingMore = useThreadList((state) => state.loadingMore);
  const hasMore = useThreadList((state) => state.hasMore);
  const error = useThreadList((state) => state.error);
  const initialize = useThreadList((state) => state.initialize);
  const loadMore = useThreadList((state) => state.loadMore);
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <section className={styles.section}>
      <div className={styles.panel}>
        <button
          type="button"
          className={styles.label}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((current) => !current)}
        >
          <span>最近</span>
          <ChevronDown
            className={`${styles.collapseIcon} ${
              collapsed ? styles.collapseIconCollapsed : ''
            }`}
            size={14}
            aria-hidden
          />
        </button>

        {collapsed ? null : (
          <div className={styles.list}>
            {error ? (
              <p
                role="alert"
                className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-error-500)]"
              >
                <span className="min-w-0 flex-1">{error}</span>
                <Button
                  type="text"
                  size="small"
                  onClick={() => void initialize()}
                >
                  重试
                </Button>
              </p>
            ) : null}

            {threads.length > 0 ? (
              <ul className={styles.rows} aria-label="历史会话">
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <ThreadRow
                      thread={thread}
                      isCurrent={thread.id === currentThreadId}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.empty}>
                {/* 加载期间不闪空态：慢网络下会先出现「暂无对话历史」再被列表替换 */}
                {loading ? '正在加载会话…' : '暂无对话历史'}
              </div>
            )}

            {hasMore ? (
              <div className={styles.loadMoreWrapper}>
                <Button
                  type="text"
                  size="small"
                  className={styles.loadMoreButton}
                  loading={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? '加载中...' : '加载更多'}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
};

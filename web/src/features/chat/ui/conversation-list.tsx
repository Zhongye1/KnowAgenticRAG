/**
 * 侧边栏里的会话列表。
 *
 * 展示与操作分开：标题、置顶标记、当前会话高亮、加载与失败状态由这里渲染，
 * 重命名、置顶、删除都经 store 落到后端；失败原因显示在列表上方，不停在静默。
 */
import * as React from 'react';
import {
  Check,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pin,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import type { ChatThread } from '../api/agent-api';
import { useThreadList } from '../model/thread-list-store';
import { disposeAgentStateReads } from '../model/agent-state';
import { disposeThreadRuntime } from '../model/thread-runtime-store';
import { paths } from '@/shared/config';
import { Button } from './antd-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './antd-dialog';
import { Dropdown } from './antd-dropdown';
import { Input } from './antd-input';

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
  const rename = useThreadList((state) => state.rename);
  const togglePin = useThreadList((state) => state.togglePin);
  const remove = useThreadList((state) => state.remove);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(thread.title ?? '');
  const [confirming, setConfirming] = React.useState(false);
  const inputRef = React.useRef<import('antd').InputRef>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = async () => {
    if (!(await rename(thread.id, draft))) return;
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="flex items-center gap-1 px-2 py-1">
        <Input
          ref={inputRef}
          value={draft}
          aria-label="会话标题"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commitRename();
            if (event.key === 'Escape') setEditing(false);
          }}
        />
        <Button

          variant="ghost"
          size="icon"
          aria-label="保存标题"
          onClick={() => void commitRename()}
        >
          <Check className="size-4" />
        </Button>
        <Button

          variant="ghost"
          size="icon"
          aria-label="取消重命名"
          onClick={() => setEditing(false)}
        >
          <X className="size-4" />
        </Button>
      </span>
    );
  }

  return (
    <span className="group/row flex items-center gap-1">
      <Link
        to={paths.app.chat.getHref(thread.id)}
        aria-current={isCurrent ? 'page' : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-medium px-2 py-1 text-sm hover:bg-sidebar-accent ${
          isCurrent
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-[var(--gray-800)]'
        }`}
      >
        <MessageSquare className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {thread.title || '未命名会话'}
        </span>
        {/* 运行中显示转圈，有新回复显示圆点，done 不显示 */}
        {thread.thread_status === 'loading' ? (
          <output
            className="flex size-3 shrink-0 items-center text-[var(--gray-500)]"
            aria-label="正在运行"
          >
            <LoaderCircle className="size-3 animate-spin" aria-hidden />
          </output>
        ) : thread.thread_status === 'ready' ? (
          <output
            className="block size-2 shrink-0 rounded-full bg-primary-6"
            aria-label="有新回复"
          />
        ) : null}
        {thread.is_pinned ? (
          <Pin className="size-3 shrink-0" aria-label="已置顶" />
        ) : null}
      </Link>

      <Dropdown
        align="end"
        items={[
          {
            kind: 'item',
            key: 'rename',
            label: '重命名',
            onSelect: () => {
              setDraft(thread.title ?? '');
              setEditing(true);
            },
          },
          {
            kind: 'item',
            key: 'pin',
            label: thread.is_pinned ? '取消置顶' : '置顶',
            onSelect: () => void togglePin(thread.id),
          },
          {
            kind: 'item',
            key: 'delete',
            label: '删除',
            onSelect: () => setConfirming(true),
          },
        ]}
      >
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
          aria-label={`会话操作：${thread.title || '未命名会话'}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </Dropdown>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除会话</DialogTitle>
            <DialogDescription>
              删除后这条会话不再出现在列表里，历史消息不会恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button

              variant="outline"
              onClick={() => setConfirming(false)}
            >
              取消
            </Button>
            <Button

              variant="destructive"
              onClick={() => {
                setConfirming(false);
                void (async () => {
                  if (!(await remove(thread.id))) return;
                  // 删掉哪条都要清掉它的运行时：订阅与在途请求不该继续为已删会话工作
                  disposeAgentStateReads(thread.id);
                  disposeThreadRuntime(thread.id);
                  if (!isCurrent) return;
                  // 删掉的正是当前会话：后端随后会返回「对话线程不存在」，
                  // 必须离开这个地址，否则用户停在一条已死的会话上
                  navigate(paths.app.chat.getHref(), { replace: true });
                })();
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
};

export const ConversationList = ({
  currentThreadId,
}: ConversationListProps) => {
  const threads = useThreadList((state) => state.threads);
  const loading = useThreadList((state) => state.loading);
  const error = useThreadList((state) => state.error);
  const initialize = useThreadList((state) => state.initialize);

  React.useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <div className="flex flex-col gap-1">
      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-error-500)]"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <Button

            variant="ghost"
            size="sm"
            onClick={() => void initialize()}
          >
            重试
          </Button>
        </p>
      ) : null}

      {threads.length === 0 ? (
        <p className="px-2 py-1 text-xs text-[var(--gray-500)]">
          {loading ? '正在加载会话…' : '还没有历史会话。'}
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5" aria-label="历史会话">
          {threads.map((thread) => (
            <li key={thread.id}>
              <ThreadRow
                thread={thread}
                isCurrent={thread.id === currentThreadId}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

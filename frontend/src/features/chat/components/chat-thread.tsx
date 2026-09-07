import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from '@assistant-ui/react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
} from 'lucide-react';
import type { FC } from 'react';

import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { ChatWelcome } from './chat-welcome';
import { AnswerMarkdown } from './answer-markdown';
import {
  AssistantMessageMeta,
  MessageSources,
  TruncationHint,
} from './message-sources';

/**
 * 知识问答 Thread 组合（基于 assistant-ui Thread 原语，参照官方 thread 元素裁剪：
 * 无附件/工具/推理部分，回答渲染接入引用角标与参考来源）。
 */

const isNewChatView = (s: { thread: { messages: readonly unknown[] } }) =>
  s.thread.messages.length === 0;

export type ChatThreadProps = {
  autoFocus?: boolean;
};

export const ChatThread: FC<ChatThreadProps> = ({ autoFocus = true }) => {
  const isEmpty = useAuiState(isNewChatView);
  return <ThreadRoot isEmpty={isEmpty} autoFocus={autoFocus} />;
};

const ThreadRoot: FC<{ isEmpty: boolean; autoFocus: boolean }> = ({
  isEmpty,
  autoFocus,
}) => {
  return (
    <ThreadPrimitive.Root
      className="flex h-full flex-col bg-background"
      style={{
        ['--thread-max-width' as string]: '48rem',
        ['--composer-radius' as string]: '1.5rem',
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div
          className={cn(
            'mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-4',
            isEmpty && 'justify-center',
          )}
        >
          <AuiIf condition={isNewChatView}>
            <ChatWelcome />
          </AuiIf>

          <div
            data-slot="chat_message-group"
            className="mb-14 flex flex-col gap-y-6 empty:hidden"
          >
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter
            className={cn(
              'bg-background flex flex-col gap-4 overflow-visible pb-4 md:pb-6',
              !isEmpty && 'sticky bottom-0 mt-auto rounded-t-(--composer-radius)',
            )}
          >
            <ThreadScrollToBottom />
            <Composer autoFocus={autoFocus} />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (isEditing) return <EditComposer />;
  if (role === 'user') return <UserMessage />;
  return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => (
  <ThreadPrimitive.ScrollToBottom asChild>
    <TooltipIconButton
      tooltip="滚动到底部"
      variant="outline"
      className="border-border bg-background hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
    >
      <ArrowDownIcon />
    </TooltipIconButton>
  </ThreadPrimitive.ScrollToBottom>
);

const Composer: FC<{ autoFocus: boolean }> = ({ autoFocus }) => (
  <ComposerPrimitive.Root className="relative flex w-full flex-col">
    <div
      data-slot="chat_composer-shell"
      className="border-border/60 focus-within:border-ring dark:border-muted-foreground/15 dark:focus-within:border-muted-foreground/30 flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border bg-card p-2 transition-[border-color]"
    >
      <ComposerPrimitive.Input
        placeholder="输入你的问题，Enter 发送"
        className="caret-primary placeholder:text-muted-foreground/60 max-h-48 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base leading-6 outline-none"
        rows={1}
        autoFocus={autoFocus}
        enterKeyHint="send"
        aria-label="消息输入"
      />
      <div className="flex items-center justify-end gap-1.5">
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <TooltipIconButton
              tooltip="发送"
              side="bottom"
              type="button"
              variant="default"
              size="icon"
              className="size-7 rounded-full"
              aria-label="发送"
            >
              <ArrowUpIcon className="size-4" />
            </TooltipIconButton>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="size-7 rounded-full"
              aria-label="停止生成"
            >
              <SquareIcon className="size-3.5 fill-current" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
    <p className="text-muted-foreground/70 mt-1.5 text-center text-xs">
      回答由 AI 基于知识库内容生成，请以引用来源为准
    </p>
  </ComposerPrimitive.Root>
);

const MessageError: FC = () => (
  <MessagePrimitive.Error>
    <ErrorPrimitive.Root className="border-destructive bg-destructive/10 text-destructive mt-2 rounded-md border p-3 text-sm">
      <ErrorPrimitive.Message className="line-clamp-3" />
    </ErrorPrimitive.Root>
  </MessagePrimitive.Error>
);

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root
    data-slot="chat_assistant-message-root"
    data-role="assistant"
    className="fade-in slide-in-from-bottom-1 animate-in relative -mb-7.5 pb-7.5 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
  >
    <div className="text-foreground px-2 leading-relaxed wrap-break-word">
      <AssistantMessageMeta />
      <MessagePrimitive.Parts components={{ Text: AnswerMarkdown }} />
      <MessageSources />
      <TruncationHint />
      <MessageError />
    </div>

    <div className="ms-2 flex min-h-7.5 items-center pt-1.5">
      <BranchPicker />
      <AssistantActionBar />
    </div>
  </MessagePrimitive.Root>
);

const AssistantActionBar: FC = () => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide="not-last"
    className="text-muted-foreground animate-in fade-in flex gap-1 duration-200"
  >
    <ActionBarPrimitive.Copy asChild>
      <TooltipIconButton tooltip="复制">
        <AuiIf condition={(s) => s.message.isCopied}>
          <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
        </AuiIf>
        <AuiIf condition={(s) => !s.message.isCopied}>
          <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
        </AuiIf>
      </TooltipIconButton>
    </ActionBarPrimitive.Copy>
    <ActionBarPrimitive.Reload asChild>
      <TooltipIconButton tooltip="重新生成">
        <RefreshCwIcon />
      </TooltipIconButton>
    </ActionBarPrimitive.Reload>
  </ActionBarPrimitive.Root>
);

const UserMessage: FC = () => (
  <MessagePrimitive.Root
    data-slot="chat_user-message-root"
    data-role="user"
    className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto] [&:where(>*)]:col-start-2"
  >
    <div className="relative col-start-2 min-w-0">
      <div className="bg-muted text-foreground peer rounded-xl px-4 py-2 wrap-break-word empty:hidden">
        <MessagePrimitive.Parts />
      </div>
      <div className="absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden">
        <UserActionBar />
      </div>
    </div>

    <BranchPicker className="col-span-full col-start-1 row-start-3 -me-1 justify-end" />
  </MessagePrimitive.Root>
);

const UserActionBar: FC = () => (
  <ActionBarPrimitive.Root
    hideWhenRunning
    autohide="not-last"
    className="flex flex-col items-end"
  >
    <ActionBarPrimitive.Edit asChild>
      <TooltipIconButton tooltip="编辑">
        <PencilIcon />
      </TooltipIconButton>
    </ActionBarPrimitive.Edit>
  </ActionBarPrimitive.Root>
);

const EditComposer: FC = () => (
  <MessagePrimitive.Root
    data-slot="chat_edit-composer-wrapper"
    className="flex flex-col px-2 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
  >
    <ComposerPrimitive.Root className="border-border/60 dark:border-muted-foreground/15 ms-auto flex w-full max-w-[85%] cursor-text flex-col rounded-(--composer-radius) border bg-card">
      <ComposerPrimitive.Input
        className="text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
        autoFocus
      />
      <div className="mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
        <ComposerPrimitive.Cancel asChild>
          <Button variant="ghost" size="sm" className="h-8 rounded-full px-3.5">
            取消
          </Button>
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send asChild>
          <Button size="sm" className="h-8 rounded-full px-3.5">
            更新
          </Button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  </MessagePrimitive.Root>
);

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => (
  <BranchPickerPrimitive.Root
    hideWhenSingleBranch
    className={cn(
      'text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs',
      className,
    )}
    {...rest}
  >
    <BranchPickerPrimitive.Previous asChild>
      <TooltipIconButton tooltip="上一个版本">
        <ChevronLeftIcon />
      </TooltipIconButton>
    </BranchPickerPrimitive.Previous>
    <span className="font-medium">
      <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
    </span>
    <BranchPickerPrimitive.Next asChild>
      <TooltipIconButton tooltip="下一个版本">
        <ChevronRightIcon />
      </TooltipIconButton>
    </BranchPickerPrimitive.Next>
  </BranchPickerPrimitive.Root>
);

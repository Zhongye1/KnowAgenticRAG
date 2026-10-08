/**
 * 一条对话消息：用户消息、系统提示，或带思维链与错误提示的助手消息。
 *
 * 与上游 `AgentMessageComponent.vue` 同结构：思维链独立折叠，正文走 Markdown，
 * 工具调用由列表层单独渲染（`hide-tool-calls`），避免同一组工具显示两次。
 */
import * as React from 'react';
import { Brain, ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react';

import type { ChatMessage } from '../api/agent-api';
import { toImageDataUrl } from '../lib/image-upload';
import { parseAssistantMessageBody } from '../lib/message-processor';
import { ImageLightbox } from './image-lightbox';
import { Markdown } from '@/shared/ui/markdown';
import { useIsDarkMode } from '@/shared/lib';

/** 后端给出的错误码到中文说明；未登记的码原样展示。 */
const ERROR_TYPE_LABELS: Record<string, string> = {
  interrupted: '回答生成已中断',
  unexpect: '生成过程中出现异常',
  content_guard_blocked: '检测到敏感内容，已中断输出',
  agent_error: '智能体获取失败',
};

type MessageItemProps = {
  message: ChatMessage;
  /** 这条消息正在流式输出，思维链此时不可折叠。 */
  isProcessing?: boolean;
};

export const MessageItem = ({ message, isProcessing = false }: MessageItemProps) => {
  const isDark = useIsDarkMode();
  const [reasoningExpanded, setReasoningExpanded] = React.useState(false);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const body = React.useMemo(() => parseAssistantMessageBody(message), [message]);
  // 还没有正文时就是在思考：这段时间思维链自动展开且不可收起，之后交给用户
  const thinking = isProcessing && !body.content;
  const showReasoning = thinking || reasoningExpanded;

  const markdownTheme = isDark ? 'github-dark' : 'github-light';

  if (message.type === 'human') {
    const image = message.image_content;
    // 历史消息只存裸 base64，不带 MIME：按内容魔数反推，避免把 jpeg 当 png 渲染
    const imageSrc = image ? toImageDataUrl(image) : null;
    return (
      <div className="flex flex-col items-end gap-2" data-role="human">
        {imageSrc ? (
          <button
            type="button"
            aria-label="查看大图"
            onClick={() => setPreviewImage(imageSrc)}
          >
            <img
              src={imageSrc}
              alt="用户上传的图片"
              className="max-h-60 w-fit rounded-medium border border-color-border-1"
            />
          </button>
        ) : null}
        <p className="max-w-[80%] whitespace-pre-wrap rounded-large bg-color-fill-2 px-3 py-2 text-sm text-color-text-1">
          {message.content}
        </p>
        {previewImage ? (
          <ImageLightbox
            src={previewImage}
            alt="用户上传的图片"
            onClose={() => setPreviewImage(null)}
          />
        ) : null}
      </div>
    );
  }

  if (message.type === 'system') {
    return <p className="text-xs text-color-text-3">{message.content}</p>;
  }

  const metadata = message.extra_metadata as {
    error_type?: string;
    error_message?: string;
  } | null;
  const errorType = message.error_type ?? metadata?.error_type ?? null;
  // 上游只要存在 error_type 就提示，正文与提示可以同时出现（半截回答不该看起来像完成）
  const errorText =
    message.error_message ??
    metadata?.error_message ??
    (errorType ? (ERROR_TYPE_LABELS[errorType] ?? errorType) : '');

  return (
    <div className="flex flex-col gap-2" data-role="assistant">
      {body.reasoningContent ? (
        <div className="flex flex-col">
          <button
            type="button"
            className="flex w-fit items-center gap-1 py-1 text-xs text-color-text-3"
            aria-expanded={showReasoning}
            disabled={thinking}
            onClick={() => setReasoningExpanded((value) => !value)}
          >
            {thinking ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Brain className="size-4" aria-hidden />
            )}
            <span>{thinking ? 'Thinking...' : '推理过程'}</span>
            {thinking ? null : reasoningExpanded ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
          </button>

          {showReasoning ? (
            <p className="whitespace-pre-wrap border-l border-color-border-1 pl-3 text-xs text-color-text-3">
              {body.reasoningContent}
            </p>
          ) : null}
        </div>
      ) : null}

      {body.content ? (
        <Markdown
          content={body.content}
          theme={markdownTheme}
          className="prose prose-sm max-w-none text-sm"
        />
      ) : null}

      {errorText ? (
        <p className="text-xs text-color-danger-6">{errorText}</p>
      ) : null}

      {message.isStoppedByUser ? (
        <p className="text-xs text-color-text-3">你停止生成了本次回答</p>
      ) : null}
    </div>
  );
};

/** 工具调用分片：`args` 按 index 增量拼接。 */
export interface ToolCallChunk {
  index?: number;
  args?: string;
  [key: string]: unknown;
}

/** 分片上的附加字段，smoother 只缓冲其中的 reasoning_content。 */
export interface AdditionalKwargs {
  reasoning_content?: string;
  [key: string]: unknown;
}

/** 流式增量分片，未列出的字段按原样透传。 */
export interface StreamChunk {
  id?: string;
  content?: string;
  reasoning_content?: string;
  additional_kwargs?: AdditionalKwargs | null;
  tool_call_chunks?: ToolCallChunk[] | null;
  [key: string]: unknown;
}

/** smoother 依赖的线程状态投影：把渲染用分片追加到 `onGoingConv.msgChunks`。 */
export interface SmootherThreadState {
  onGoingConv: {
    msgChunks: Record<string, StreamChunk[] | undefined>;
  };
}

/** smoother 的节流参数。 */
export interface StreamSmootherOptions {
  minChunkSize: number;
  maxChunkSize: number;
  /** 突发或重新进入对话时历史补发超过此字符量，直接快速放行，避免漫长打字重放。 */
  fastForwardThreshold: number;
  fastForwardTailChars: number;
}

/** smoother 实例对外暴露的接口。 */
export interface StreamSmoother {
  pushChunk(chunk: StreamChunk | null | undefined, threadId: string): void;
  flushThread(threadId: string): void;
  resetThread(threadId?: string | null): void;
}

/** 工厂参数。 */
export interface CreateStreamSmootherParams {
  getThreadState: (threadId: string) => SmootherThreadState | null | undefined;
  options?: Partial<StreamSmootherOptions> | null;
}

type FrameCallback = (time: number) => void;

type FrameHandle = number | ReturnType<typeof setTimeout>;

interface ToolCallArgEntry {
  buffer: string;
}

interface MessageController {
  skeleton: StreamChunk;
  contentBuffer: string;
  reasoningBuffer: string;
  additionalReasoningBuffer: string;
  toolCallArgBuffers: Map<number | undefined, ToolCallArgEntry>;
  scheduled: boolean;
  frameId: FrameHandle | null;
}

const cloneChunk = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const hasText = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0;

const createEmptyToolCallChunk = (
  toolCallChunk: ToolCallChunk,
): ToolCallChunk => ({
  ...toolCallChunk,
  args: '',
});

const stripBufferedFields = (chunk: StreamChunk): StreamChunk => {
  const stripped = cloneChunk(chunk);
  stripped.content = '';
  stripped.reasoning_content = '';

  if (stripped.additional_kwargs?.reasoning_content !== undefined) {
    stripped.additional_kwargs = {
      ...stripped.additional_kwargs,
      reasoning_content: '',
    };
  }

  if (Array.isArray(stripped.tool_call_chunks)) {
    stripped.tool_call_chunks = stripped.tool_call_chunks.map(
      createEmptyToolCallChunk,
    );
  }

  return stripped;
};

const hasBufferedPayload = (chunk: StreamChunk | null | undefined): boolean =>
  hasText(chunk?.content) ||
  hasText(chunk?.reasoning_content) ||
  hasText(chunk?.additional_kwargs?.reasoning_content) ||
  (Array.isArray(chunk?.tool_call_chunks) &&
    chunk.tool_call_chunks.some((item) => hasText(item?.args)));

const appendLoadingChunk = (
  threadState: SmootherThreadState | null | undefined,
  chunk: StreamChunk | null | undefined,
): void => {
  if (!threadState || !chunk?.id) return;
  if (!threadState.onGoingConv.msgChunks[chunk.id]) {
    threadState.onGoingConv.msgChunks[chunk.id] = [];
  }
  threadState.onGoingConv.msgChunks[chunk.id]!.push(chunk);
};

const raf: (callback: FrameCallback) => FrameHandle =
  typeof window !== 'undefined' &&
  typeof window.requestAnimationFrame === 'function'
    ? (callback) => window.requestAnimationFrame(callback)
    : (callback) => setTimeout(() => callback(Date.now()), 16);

const caf: (handle: FrameHandle) => void =
  typeof window !== 'undefined' &&
  typeof window.cancelAnimationFrame === 'function'
    ? // 浏览器分支拿到的一定是 rAF 句柄，定时器句柄只可能来自上面的回退分支。
      (handle) => window.cancelAnimationFrame(handle as number)
    : (handle) => clearTimeout(handle);

const DEFAULT_OPTIONS: StreamSmootherOptions = {
  minChunkSize: 1,
  maxChunkSize: 48,
  fastForwardThreshold: 50,
  fastForwardTailChars: 6,
};

const createController = (chunk: StreamChunk): MessageController => ({
  skeleton: stripBufferedFields(chunk),
  contentBuffer: '',
  reasoningBuffer: '',
  additionalReasoningBuffer: '',
  toolCallArgBuffers: new Map(),
  scheduled: false,
  frameId: null,
});

const mergeSkeleton = (
  controller: MessageController,
  chunk: StreamChunk,
): void => {
  const stripped = stripBufferedFields(chunk);

  Object.entries(stripped).forEach(([key, value]) => {
    if (
      key === 'content' ||
      key === 'reasoning_content' ||
      key === 'tool_call_chunks' ||
      key === 'additional_kwargs'
    ) {
      return;
    }
    controller.skeleton[key] = value;
  });

  if (stripped.additional_kwargs) {
    controller.skeleton.additional_kwargs = {
      ...controller.skeleton.additional_kwargs,
      ...stripped.additional_kwargs,
    };
  }

  if (Array.isArray(stripped.tool_call_chunks)) {
    const existing = Array.isArray(controller.skeleton.tool_call_chunks)
      ? [...controller.skeleton.tool_call_chunks]
      : [];

    stripped.tool_call_chunks.forEach((toolCallChunk) => {
      const index = toolCallChunk?.index;
      const existingIndex = existing.findIndex((item) => item?.index === index);
      if (existingIndex >= 0) {
        existing[existingIndex] = {
          ...existing[existingIndex],
          ...toolCallChunk,
        };
      } else {
        existing.push(toolCallChunk);
      }
    });

    controller.skeleton.tool_call_chunks = existing;
  }
};

const getBufferedLength = (controller: MessageController): number => {
  let total =
    controller.contentBuffer.length +
    controller.reasoningBuffer.length +
    controller.additionalReasoningBuffer.length;

  controller.toolCallArgBuffers.forEach((entry) => {
    total += entry.buffer.length;
  });

  return total;
};

const getSmoothBudget = (
  pending: number,
  options: StreamSmootherOptions,
): number => {
  if (pending <= 0) return 0;
  if (pending <= 3) return 1;
  if (pending <= 12) return 2;
  if (pending <= 30) return Math.ceil(pending / 4);
  return Math.min(options.maxChunkSize, Math.ceil(pending / 2));
};

const takeFromBuffer = (
  value: string,
  count: number,
): { emitted: string; rest: string } => {
  if (!value || count <= 0) {
    return { emitted: '', rest: value || '' };
  }
  return {
    emitted: value.slice(0, count),
    rest: value.slice(count),
  };
};

/** 创建按帧节流推送流式增量的 smoother 实例。 */
export function createStreamSmoother({
  getThreadState,
  options = {},
}: CreateStreamSmootherParams): StreamSmoother {
  const resolvedOptions: StreamSmootherOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const controllersByThread = new Map<string, Map<string, MessageController>>();

  const getThreadControllers = (
    threadId: string,
  ): Map<string, MessageController> => {
    if (!controllersByThread.has(threadId)) {
      controllersByThread.set(threadId, new Map());
    }
    return controllersByThread.get(threadId)!;
  };

  const emitDelta = (
    threadId: string,
    messageId: string,
    forceFlush = false,
    customBudget: number | null = null,
  ): void => {
    const threadState = getThreadState(threadId);
    const threadControllers = controllersByThread.get(threadId);
    const controller = threadControllers?.get(messageId);

    if (!threadState || !controller) return;

    const pending = getBufferedLength(controller);
    if (pending <= 0) {
      controller.scheduled = false;
      controller.frameId = null;
      return;
    }

    const budget = forceFlush
      ? pending
      : customBudget !== null &&
          Number.isFinite(customBudget) &&
          customBudget > 0
        ? Math.min(pending, Math.floor(customBudget))
        : getSmoothBudget(pending, resolvedOptions);

    let remaining = budget;
    const delta = stripBufferedFields(controller.skeleton);

    const contentPart = takeFromBuffer(controller.contentBuffer, remaining);
    delta.content = contentPart.emitted;
    controller.contentBuffer = contentPart.rest;
    remaining -= contentPart.emitted.length;

    const reasoningPart = takeFromBuffer(controller.reasoningBuffer, remaining);
    delta.reasoning_content = reasoningPart.emitted;
    controller.reasoningBuffer = reasoningPart.rest;
    remaining -= reasoningPart.emitted.length;

    const additionalReasoningPart = takeFromBuffer(
      controller.additionalReasoningBuffer,
      remaining,
    );
    if (
      additionalReasoningPart.emitted ||
      delta.additional_kwargs?.reasoning_content !== undefined
    ) {
      delta.additional_kwargs = {
        ...delta.additional_kwargs,
        reasoning_content: additionalReasoningPart.emitted,
      };
    }
    controller.additionalReasoningBuffer = additionalReasoningPart.rest;
    remaining -= additionalReasoningPart.emitted.length;

    if (Array.isArray(delta.tool_call_chunks)) {
      delta.tool_call_chunks = delta.tool_call_chunks
        .map((toolCallChunk): ToolCallChunk | null => {
          const entry = controller.toolCallArgBuffers.get(toolCallChunk.index);
          if (!entry) return null;
          const argPart = takeFromBuffer(
            entry.buffer,
            remaining > 0 ? remaining : forceFlush ? pending : 0,
          );
          entry.buffer = argPart.rest;
          remaining -= argPart.emitted.length;
          return {
            ...toolCallChunk,
            args: argPart.emitted,
          };
        })
        .filter((item): item is ToolCallChunk => Boolean(item));
    }

    const hasOutput =
      hasText(delta.content) ||
      hasText(delta.reasoning_content) ||
      hasText(delta.additional_kwargs?.reasoning_content) ||
      (Array.isArray(delta.tool_call_chunks) &&
        delta.tool_call_chunks.some((item) => hasText(item?.args)));

    if (hasOutput) {
      appendLoadingChunk(threadState, delta);
    }

    const remainingPending = getBufferedLength(controller);
    if (remainingPending > 0 && !forceFlush) {
      controller.scheduled = true;
      controller.frameId = raf(() => emitDelta(threadId, messageId));
      return;
    }

    controller.scheduled = false;
    controller.frameId = null;
  };

  const schedule = (threadId: string, messageId: string): void => {
    const controller = controllersByThread.get(threadId)?.get(messageId);
    if (!controller || controller.scheduled) return;
    controller.scheduled = true;
    controller.frameId = raf(() => emitDelta(threadId, messageId));
  };

  const pushChunk = (
    chunk: StreamChunk | null | undefined,
    threadId: string,
  ): void => {
    const threadState = getThreadState(threadId);
    if (!threadState || !chunk?.id) return;

    if (!hasBufferedPayload(chunk)) {
      appendLoadingChunk(threadState, chunk);
      return;
    }

    const threadControllers = getThreadControllers(threadId);
    let controller = threadControllers.get(chunk.id);

    if (!controller) {
      controller = createController(chunk);
      threadControllers.set(chunk.id, controller);
      appendLoadingChunk(threadState, controller.skeleton);
    } else {
      mergeSkeleton(controller, chunk);
    }

    controller.contentBuffer += chunk.content || '';
    controller.reasoningBuffer += chunk.reasoning_content || '';
    controller.additionalReasoningBuffer +=
      chunk.additional_kwargs?.reasoning_content || '';

    if (Array.isArray(chunk.tool_call_chunks)) {
      chunk.tool_call_chunks.forEach((toolCallChunk) => {
        const index = toolCallChunk?.index;
        if (index === undefined || index === null) return;

        const existing = controller.toolCallArgBuffers.get(index) || {
          buffer: '',
        };
        existing.buffer += toolCallChunk.args || '';
        controller.toolCallArgBuffers.set(index, existing);
      });
    }

    const pending = getBufferedLength(controller);
    if (pending > resolvedOptions.fastForwardThreshold) {
      const fastForwardCount = pending - resolvedOptions.fastForwardTailChars;
      if (fastForwardCount > 0) {
        emitDelta(threadId, chunk.id, false, fastForwardCount);
      }
    }

    schedule(threadId, chunk.id);
  };

  const flushThread = (threadId: string): void => {
    const threadControllers = controllersByThread.get(threadId);
    if (!threadControllers) return;

    threadControllers.forEach((controller, messageId) => {
      if (controller.frameId !== null) {
        caf(controller.frameId);
      }
      emitDelta(threadId, messageId, true);
    });
  };

  const resetThread = (threadId: string | null = null): void => {
    if (threadId) {
      const threadControllers = controllersByThread.get(threadId);
      if (!threadControllers) return;
      threadControllers.forEach((controller) => {
        if (controller.frameId !== null) {
          caf(controller.frameId);
        }
      });
      controllersByThread.delete(threadId);
      return;
    }

    controllersByThread.forEach((threadControllers) => {
      threadControllers.forEach((controller) => {
        if (controller.frameId !== null) {
          caf(controller.frameId);
        }
      });
    });
    controllersByThread.clear();
  };

  return {
    pushChunk,
    flushThread,
    resetThread,
  };
}

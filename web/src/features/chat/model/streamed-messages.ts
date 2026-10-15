/**
 * 流式分片到可渲染消息的派生。
 *
 * 分片表是就地追加的可变容器：容器身份在一次流内不变，而内容每帧都在变。React
 * Compiler 会把「按依赖身份缓存表达式」的派生冻结在空帧上，因此这里与
 * `useThreadRuntime` 一样显式退出编译优化，并且不做记忆化。
 */
import {
  attachToolResults,
  splitStreamedChunks,
} from '../lib/message-processor';
import type { ConversationMessage } from '../lib/message-processor';
import type { StreamedChunk } from '../lib/message-processor';
import { useThreadRuntime } from './thread-runtime-store';

/** 当前线程正在流式输出的消息；空数组表示没有。 */
export function useStreamingMessages(
  threadId: string | undefined,
): ConversationMessage[] {
  'use no memo';
  const runtime = useThreadRuntime(threadId);
  const chunks = runtime?.onGoingConv.msgChunks ?? {};

  const { messages, toolResults } = splitStreamedChunks(
    Object.entries(chunks) as Array<[string, StreamedChunk[]]>,
  );
  // 工具结果是独立分片，并回发起它的那次调用后工具行才能从「进行中」变成结果
  return attachToolResults(messages, toolResults);
}

import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * 运行时的收尾回调要一路接进页面。
 *
 * 页面测试把 `useChatRuntime` 整个换掉了，只能证明页面回调的函数体；
 * 这里用真实的 hook + 桩掉的 run 流，验证「运行时收到终态/中断 → 选项被调用」这条线没断。
 */
const { runStream } = vi.hoisted(() => ({
  runStream: { options: null as null | Record<string, unknown> },
}));

vi.mock('@/features/chat/model/run-stream', () => ({
  createRunStream: (options: Record<string, unknown>) => {
    runStream.options = options;
    return {
      startRunStream: vi.fn(),
      resumeActiveRunForThread: vi.fn(),
      stopRunStreamSubscription: vi.fn(),
    };
  },
}));

const { useChatRuntime } = await import('@/features/chat/model/chat-runtime');

const Probe = ({ onSettled }: { onSettled: (threadId: string) => void }) => {
  useChatRuntime({
    currentAgentId: () => 'default-chatbot',
    fetchAgentState: () => undefined,
    onRunSettled: onSettled,
  });
  return null;
};

describe('run 收尾回调的接线', () => {
  it('终态与中断都会把线程 id 交给页面', () => {
    const onSettled = vi.fn();
    render(<Probe onSettled={onSettled} />);

    act(() => {
      (
        runStream.options?.onTerminalDetected as (info: {
          threadId: string;
        }) => void
      )({
        threadId: 'thread-A',
      });
    });
    expect(onSettled).toHaveBeenCalledWith('thread-A');

    act(() => {
      (
        runStream.options?.onInterruptDetected as (info: {
          threadId: string;
        }) => void
      )({
        threadId: 'thread-B',
      });
    });
    expect(onSettled).toHaveBeenCalledWith('thread-B');
  });
});

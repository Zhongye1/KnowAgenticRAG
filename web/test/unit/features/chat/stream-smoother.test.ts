import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createStreamSmoother,
  type SmootherThreadState,
  type StreamChunk,
} from '@/features/chat/lib/stream-smoother';

/**
 * 受控帧：只登记回调，由 `runFrame` 模拟一次浏览器帧。
 * 这样用例不依赖真实 rAF，节流行为完全由测试决定何时推进。
 */
const frameCallbacks = new Map<number, (time: number) => void>();
let nextFrameId = 1;

const runFrame = (): void => {
  const queued = [...frameCallbacks.entries()];
  frameCallbacks.clear();
  queued.forEach(([, callback]) => {
    callback(0);
  });
};

const pendingFrameCount = (): number => frameCallbacks.size;

/** 一直推进帧直到没有待执行回调，用于观察尾部字符的完整落点。 */
const drainFrames = (): void => {
  let guard = 0;
  while (frameCallbacks.size > 0 && guard < 100) {
    runFrame();
    guard += 1;
  }
};

const createThreadState = (): SmootherThreadState => ({
  onGoingConv: { msgChunks: {} },
});

const chunksOf = (
  threadState: SmootherThreadState,
  messageId: string,
): StreamChunk[] => threadState.onGoingConv.msgChunks[messageId] ?? [];

const contentsOf = (
  threadState: SmootherThreadState,
  messageId: string,
): (string | undefined)[] =>
  chunksOf(threadState, messageId).map((chunk) => chunk.content);

beforeEach(() => {
  vi.useFakeTimers();
  frameCallbacks.clear();
  nextFrameId = 1;
  window.requestAnimationFrame = ((callback: (time: number) => void) => {
    const id = nextFrameId;
    nextFrameId += 1;
    frameCallbacks.set(id, callback);
    return id;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) => {
    frameCallbacks.delete(id);
  }) as typeof window.cancelAnimationFrame;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createStreamSmoother 的帧节流', () => {
  it('同一帧内的多次推送只合并成一个帧回调，并按预算逐帧吐出', () => {
    const threadState = createThreadState();
    const smoother = createStreamSmoother({
      getThreadState: () => threadState,
    });

    smoother.pushChunk({ id: 'm1', content: 'a' }, 't1');
    smoother.pushChunk({ id: 'm1', content: 'b' }, 't1');
    smoother.pushChunk({ id: 'm1', content: 'c' }, 't1');

    // 三次推送只登记一个帧回调，帧回调执行前只落地了骨架
    expect(pendingFrameCount()).toBe(1);
    expect(contentsOf(threadState, 'm1')).toEqual(['']);

    // 每帧按剩余积压量重算预算：3 个字符 → 每帧 1 个
    runFrame();
    expect(contentsOf(threadState, 'm1')).toEqual(['', 'a']);
    expect(pendingFrameCount()).toBe(1);

    runFrame();
    expect(contentsOf(threadState, 'm1')).toEqual(['', 'a', 'b']);
    expect(pendingFrameCount()).toBe(1);

    runFrame();
    expect(contentsOf(threadState, 'm1')).toEqual(['', 'a', 'b', 'c']);
    expect(pendingFrameCount()).toBe(0);
  });

  it('每帧预算随积压量放大且不超过 maxChunkSize', () => {
    const threadState = createThreadState();
    const smoother = createStreamSmoother({
      getThreadState: () => threadState,
      options: { fastForwardThreshold: 1000 },
    });

    smoother.pushChunk({ id: 'm1', content: 'x'.repeat(30) }, 't1');
    runFrame();

    // pending=30 → ceil(30/4)=8
    expect(contentsOf(threadState, 'm1')[1]).toHaveLength(8);

    const bulkyState = createThreadState();
    const bulkySmoother = createStreamSmoother({
      getThreadState: () => bulkyState,
      options: { fastForwardThreshold: 1000, maxChunkSize: 48 },
    });

    bulkySmoother.pushChunk({ id: 'm1', content: 'x'.repeat(100) }, 't1');
    runFrame();

    // pending=100 → min(maxChunkSize, ceil(100/2)) = 48
    expect(contentsOf(bulkyState, 'm1')[1]).toHaveLength(48);
  });

  it('多线程各自持有控制器，flush 一个线程不影响另一个线程', () => {
    const states = new Map<string, SmootherThreadState>([
      ['t1', createThreadState()],
      ['t2', createThreadState()],
    ]);
    const smoother = createStreamSmoother({
      getThreadState: (threadId) => states.get(threadId),
    });

    smoother.pushChunk({ id: 'm1', content: 'AAA' }, 't1');
    smoother.pushChunk({ id: 'm1', content: 'BBB' }, 't2');
    expect(pendingFrameCount()).toBe(2);

    smoother.flushThread('t1');

    expect(contentsOf(states.get('t1')!, 'm1')).toEqual(['', 'AAA']);
    expect(contentsOf(states.get('t2')!, 'm1')).toEqual(['']);
    // t1 的帧被取消，t2 的帧仍在队列里
    expect(pendingFrameCount()).toBe(1);

    runFrame();
    expect(contentsOf(states.get('t2')!, 'm1')).toEqual(['', 'B']);
    expect(pendingFrameCount()).toBe(1);

    drainFrames();
    expect(contentsOf(states.get('t2')!, 'm1')).toEqual(['', 'B', 'B', 'B']);
    expect(contentsOf(states.get('t1')!, 'm1')).toEqual(['', 'AAA']);
  });
});

describe('createStreamSmoother 的终态强刷', () => {
  it('flushThread 立即落地全部缓冲并取消待执行帧', () => {
    const threadState = createThreadState();
    const smoother = createStreamSmoother({
      getThreadState: () => threadState,
    });

    smoother.pushChunk({ id: 'm1', content: 'hello' }, 't1');
    smoother.pushChunk({ id: 'm1', reasoning_content: '想' }, 't1');
    expect(pendingFrameCount()).toBe(1);

    smoother.flushThread('t1');

    expect(contentsOf(threadState, 'm1')).toEqual(['', 'hello']);
    expect(chunksOf(threadState, 'm1')[1].reasoning_content).toBe('想');
    expect(pendingFrameCount()).toBe(0);

    // 已取消的帧再推进也不会补吐
    runFrame();
    expect(chunksOf(threadState, 'm1')).toHaveLength(2);
  });

  it('flushThread 对没有缓冲的线程是空操作', () => {
    const threadState = createThreadState();
    const smoother = createStreamSmoother({
      getThreadState: () => threadState,
    });

    smoother.flushThread('t1');

    expect(chunksOf(threadState, 'm1')).toHaveLength(0);
    expect(pendingFrameCount()).toBe(0);
  });
});

describe('createStreamSmoother 的边界处理', () => {
  it('超过快速放行阈值时先吐掉历史，只留尾部参与逐帧动画', () => {
    const threadState = createThreadState();
    const smoother = createStreamSmoother({
      getThreadState: () => threadState,
    });

    smoother.pushChunk({ id: 'm1', content: 'x'.repeat(60) }, 't1');

    // 60 个字符一次性到达：立刻放行 54 个，尾部 6 个继续按帧推送
    expect(contentsOf(threadState, 'm1')[1]).toBe('x'.repeat(54));
    expect(pendingFrameCount()).toBe(1);

    drainFrames();

    // 尾部不会一次吐完，而是按预算分帧落地
    const tail = contentsOf(threadState, 'm1').slice(2);
    expect(tail.length).toBeGreaterThan(1);
    expect(tail.join('')).toBe('x'.repeat(6));
    expect(pendingFrameCount()).toBe(0);
  });

  it('恰好等于快速放行阈值时不触发快速放行', () => {
    const threadState = createThreadState();
    const smoother = createStreamSmoother({
      getThreadState: () => threadState,
    });

    smoother.pushChunk({ id: 'm1', content: 'x'.repeat(50) }, 't1');

    expect(contentsOf(threadState, 'm1')).toEqual(['']);
    expect(pendingFrameCount()).toBe(1);
  });

  it('没有可缓冲文本的分片直接追加，不占用帧调度', () => {
    const threadState = createThreadState();
    const smoother = createStreamSmoother({
      getThreadState: () => threadState,
    });
    const plainChunk: StreamChunk = { id: 'm1', status: 'running' };

    smoother.pushChunk(plainChunk, 't1');

    expect(chunksOf(threadState, 'm1')).toEqual([plainChunk]);
    expect(pendingFrameCount()).toBe(0);
  });

  it('线程状态缺失或分片缺少 id 时静默丢弃', () => {
    const threadState = createThreadState();
    const smoother = createStreamSmoother({
      getThreadState: (threadId) => (threadId === 't1' ? threadState : null),
    });

    smoother.pushChunk({ id: 'm1', content: 'a' }, 'missing');
    smoother.pushChunk({ content: 'a' }, 't1');

    expect(chunksOf(threadState, 'm1')).toHaveLength(0);
    expect(pendingFrameCount()).toBe(0);
  });

  it('骨架剥掉缓冲字段，推理与工具参数在增量里落地，且不就地改写输入分片', () => {
    const threadState = createThreadState();
    const smoother = createStreamSmoother({
      getThreadState: () => threadState,
    });
    const chunk: StreamChunk = {
      id: 'm1',
      content: 'hi',
      reasoning_content: 'think',
      additional_kwargs: { reasoning_content: 'more', extra: 1 },
      tool_call_chunks: [{ index: 0, name: 'f', args: '{"a":' }],
    };

    smoother.pushChunk(chunk, 't1');

    const skeleton = chunksOf(threadState, 'm1')[0];
    expect(skeleton.content).toBe('');
    expect(skeleton.reasoning_content).toBe('');
    expect(skeleton.additional_kwargs).toEqual({
      reasoning_content: '',
      extra: 1,
    });
    expect(skeleton.tool_call_chunks?.[0]).toEqual({
      index: 0,
      name: 'f',
      args: '',
    });
    expect(chunk.content).toBe('hi');
    expect(chunk.tool_call_chunks?.[0].args).toBe('{"a":');

    smoother.flushThread('t1');

    const delta = chunksOf(threadState, 'm1')[1];
    expect(delta.content).toBe('hi');
    expect(delta.reasoning_content).toBe('think');
    expect(delta.additional_kwargs?.reasoning_content).toBe('more');
    expect(delta.tool_call_chunks?.[0].args).toBe('{"a":');
  });

  it('后续分片就地合并进已入队的骨架，内容仍只落在增量里', () => {
    const threadState = createThreadState();
    const smoother = createStreamSmoother({
      getThreadState: () => threadState,
    });

    smoother.pushChunk({ id: 'm1', content: 'a', status: 'running' }, 't1');
    smoother.pushChunk(
      { id: 'm1', content: 'b', status: 'done', extra: 1 },
      't1',
    );
    smoother.flushThread('t1');

    const [skeleton, delta] = chunksOf(threadState, 'm1');
    expect(chunksOf(threadState, 'm1')).toHaveLength(2);
    // 骨架按引用入队，mergeSkeleton 的更新会体现在已入队的条目上
    expect(skeleton.status).toBe('done');
    expect(skeleton.extra).toBe(1);
    expect(skeleton.content).toBe('');
    expect(delta.status).toBe('done');
    expect(delta.content).toBe('ab');
  });

  it('resetThread 取消待执行帧并丢弃缓冲，但不动线程状态', () => {
    const threadState = createThreadState();
    const smoother = createStreamSmoother({
      getThreadState: () => threadState,
    });

    smoother.pushChunk({ id: 'm1', content: 'abc' }, 't1');
    expect(pendingFrameCount()).toBe(1);

    smoother.resetThread('t1');

    expect(pendingFrameCount()).toBe(0);
    runFrame();
    expect(contentsOf(threadState, 'm1')).toEqual(['']);

    // 重新推送会新建控制器，骨架再追加一份
    smoother.pushChunk({ id: 'm1', content: 'z' }, 't1');
    expect(contentsOf(threadState, 'm1')).toEqual(['', '']);
  });

  it('resetThread 不传参时清空全部线程的待执行帧', () => {
    const states = new Map<string, SmootherThreadState>([
      ['t1', createThreadState()],
      ['t2', createThreadState()],
    ]);
    const smoother = createStreamSmoother({
      getThreadState: (threadId) => states.get(threadId),
    });

    smoother.pushChunk({ id: 'm1', content: 'a' }, 't1');
    smoother.pushChunk({ id: 'm1', content: 'b' }, 't2');
    expect(pendingFrameCount()).toBe(2);

    smoother.resetThread();

    expect(pendingFrameCount()).toBe(0);
  });
});

describe('createStreamSmoother 在缺少 rAF 的环境', () => {
  it('回退到 16ms 定时器驱动帧回调', async () => {
    const originalRaf = window.requestAnimationFrame;
    Object.defineProperty(window, 'requestAnimationFrame', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    vi.resetModules();

    try {
      const { createStreamSmoother: createFallbackSmoother } =
        await import('@/features/chat/lib/stream-smoother');
      const threadState = createThreadState();
      const smoother = createFallbackSmoother({
        getThreadState: () => threadState,
      });

      smoother.pushChunk({ id: 'm1', content: 'hi' }, 't1');
      expect(contentsOf(threadState, 'm1')).toEqual(['']);

      vi.advanceTimersByTime(15);
      expect(contentsOf(threadState, 'm1')).toEqual(['']);

      vi.advanceTimersByTime(1);
      expect(contentsOf(threadState, 'm1')).toEqual(['', 'h']);

      // 剩余 1 个字符由下一个 16ms 定时器吐出
      vi.advanceTimersByTime(16);
      expect(contentsOf(threadState, 'm1')).toEqual(['', 'h', 'i']);
    } finally {
      Object.defineProperty(window, 'requestAnimationFrame', {
        value: originalRaf,
        configurable: true,
        writable: true,
      });
    }
  });
});

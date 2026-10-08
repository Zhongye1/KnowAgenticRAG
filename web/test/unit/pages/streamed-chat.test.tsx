import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { MessageList } from '@/features/chat/ui/message-list';
import { useStreamingMessages } from '@/features/chat/model/streamed-messages';
import {
  disposeThreadRuntime,
  getThreadRuntime,
  notifyThreadRuntime,
} from '@/features/chat/model/thread-runtime-store';

const THREAD = 'thread-stream-render';

/**
 * 与对话页同样的组合：切片里的派生 hook + 真 MessageList。
 * 这里刻意不 mock 任何一层，否则 React Compiler 把派生冻结在空帧上的问题
 * （分片表就地追加、容器身份不变）不会暴露。
 */
const StreamedChat = () => {
  const streamingMessages = useStreamingMessages(THREAD);
  // 与对话页一致：正在处理时最后一组工具保持展开
  return (
    <MessageList messages={[]} streamingMessages={streamingMessages} isProcessing />
  );
};

const pushAiChunk = (content: string) => {
  const runtime = getThreadRuntime(THREAD);
  const chunk = { id: 'ai-1', type: 'AIMessageChunk', content };
  const chunks = runtime.onGoingConv.msgChunks['ai-1'];
  if (chunks) chunks.push(chunk);
  else runtime.onGoingConv.msgChunks['ai-1'] = [chunk];
};

describe('流式消息渲染', () => {
  beforeEach(() => disposeThreadRuntime(THREAD));

  it('就地追加的分片也要让正文出现在界面上', async () => {
    const runtime = getThreadRuntime(THREAD);
    render(<StreamedChat />);

    pushAiChunk('正在输出');
    // 分片数组是同一个对象、内容变了；派生的缓存会让这里一直停在空态
    runtime.onGoingConv.msgChunks['ai-1']!.push({
      id: 'ai-1',
      type: 'AIMessageChunk',
      content: '，继续输出',
    });
    notifyThreadRuntime(THREAD);

    // 正文走异步 Markdown（shiki 首次加载），负载高时要给更宽的窗口
    await waitFor(
      () => expect(screen.getByText('正在输出，继续输出')).toBeTruthy(),
      { timeout: 5_000 },
    );
  });

  it('工具结果分片到达后工具行离开「进行中」', async () => {
    const runtime = getThreadRuntime(THREAD);
    render(<StreamedChat />);

    runtime.onGoingConv.msgChunks['ai-1'] = [
      {
        id: 'ai-1',
        type: 'AIMessageChunk',
        content: '',
        tool_call_chunks: [
          { index: 0, id: 'call_1', name: 'bash', args: '{"cmd":"ls"}' },
        ],
      },
    ];
    notifyThreadRuntime(THREAD);

    await waitFor(
      () => expect(screen.getByRole('button', { name: /正在调用工具/ })).toBeTruthy(),
      { timeout: 5_000 },
    );

    runtime.onGoingConv.msgChunks['call_1'] = [
      { id: 'call_1', type: 'tool', tool_call_id: 'call_1', content: '文件列表' },
    ];
    notifyThreadRuntime(THREAD);

    await waitFor(
      () => expect(screen.getByRole('button', { name: /执行完成/ })).toBeTruthy(),
      { timeout: 5_000 },
    );
  });
});

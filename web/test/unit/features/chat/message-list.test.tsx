import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { ChatMessage } from '@/features/chat/api/agent-api';
import { MessageList } from '@/features/chat/ui/message-list';

const human = (id: number, content: string): ChatMessage => ({
  id,
  type: 'human',
  content,
});

const assistant = (
  id: number,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({ id, type: 'ai', content: '回答', ...extra });

/** Markdown 正文是异步渲染的，整仓并发跑测试时要给它更宽的等待窗口。 */
const findBodyText = (text: string) =>
  screen.findByText(text, {}, { timeout: 5_000 });

const toolCall = (id: string, name = 'bash') => ({
  id,
  name,
  function: { name, arguments: '{"command":"ls"}' },
  status: 'success',
  tool_call_result: { content: '文件列表' },
});

describe('MessageList', () => {
  it('没有消息时给出空态提示', () => {
    render(<MessageList messages={[]} />);

    expect(screen.getByText('还没有消息，发送一条试试。')).toBeTruthy();
  });

  it('渲染历史消息，并按用户消息切成多轮', async () => {
    render(
      <MessageList
        messages={[
          human(1, '第一问'),
          assistant(2, { content: '第一答' }),
          human(3, '第二问'),
          assistant(4, { content: '第二答' }),
        ]}
      />,
    );

    expect(screen.getAllByTestId('conversation')).toHaveLength(2);
    expect(screen.getByText('第一问')).toBeTruthy();
    expect(screen.getByText('第二问')).toBeTruthy();
    for (const text of ['第一答', '第二答']) {
      expect(await findBodyText(text)).toBeTruthy();
    }
  });

  it('工具调用折叠成一行摘要，展开后显示参数与结果', async () => {
    render(
      <MessageList
        messages={[
          human(1, '问题'),
          assistant(2, { content: '', tool_calls: [toolCall('t-1')] }),
          assistant(3, { content: '最终回答' }),
        ]}
      />,
    );

    // 这一轮已收尾，中间过程先折成一行；逐层展开后才看到参数与结果
    await userEvent.click(screen.getByRole('button', { name: /处理过程/ }));
    const summary = screen.getByRole('button', { name: /调用: 执行命令/ });
    expect(screen.queryByText(/参数/)).toBeNull();

    await userEvent.click(summary);
    // 工具组展开后每条调用仍是收起的，再点一次才看到参数与结果
    await userEvent.click(screen.getByRole('button', { name: /执行完成/ }));

    // 「参数: 」在 <strong> 里，取文本节点会带上标签边界，用正则匹配
    expect(
      await screen.findByText(/参数/, {}, { timeout: 5_000 }),
    ).toBeTruthy();
    expect(screen.getByText(/"command": "ls"/)).toBeTruthy();
    expect(screen.getByText('文件列表')).toBeTruthy();
  }, 20_000);

  it('已收尾的轮次把中间过程折成耗时一行，展开后能看到过程', async () => {
    render(
      <MessageList
        messages={[
          human(1, '问题'),
          assistant(2, { content: '中间步骤', tool_calls: [toolCall('t-1')] }),
          assistant(3, {
            content: '最终回答',
            run_started_at: '2026-10-01T10:00:00',
            run_finished_at: '2026-10-01T10:00:30',
          }),
        ]}
      />,
    );

    // 中间步骤被折起来：正文与工具摘要都不直接出现
    expect(screen.queryByText('中间步骤')).toBeNull();
    const summary = screen.getByRole('button', { name: /耗时0分钟30秒/ });

    await userEvent.click(summary);

    expect(await findBodyText('中间步骤')).toBeTruthy();
    expect(screen.getByRole('button', { name: /调用: 执行命令/ })).toBeTruthy();
    expect(await findBodyText('最终回答')).toBeTruthy();
  }, 20_000);

  it('正在输出的那一轮不折叠，中间步骤始终可见', async () => {
    render(
      <MessageList
        isProcessing
        messages={[
          human(1, '问题'),
          assistant(2, { content: '中间步骤', tool_calls: [toolCall('t-1')] }),
          assistant(3, { content: '最新回答' }),
        ]}
      />,
    );

    expect(await findBodyText('中间步骤')).toBeTruthy();
    expect(await findBodyText('最新回答')).toBeTruthy();
  });

  it('用户消息与助手消息用角色标记区分', async () => {
    render(
      <MessageList
        messages={[human(1, '我的问题'), assistant(2, { content: '助手回答' })]}
      />,
    );

    expect(await findBodyText('助手回答')).toBeTruthy();
    expect(
      screen.getByText('我的问题').closest('[data-role]')?.getAttribute('data-role'),
    ).toBe('human');
    expect(
      screen
        .getByText('助手回答')
        .closest('[data-role]')
        ?.getAttribute('data-role'),
    ).toBe('assistant');
  });

  it('思考中（还没有正文）时思维链自动展开且不能收起', async () => {
    render(
      <MessageList
        messages={[]}
        isProcessing
        streamingMessages={[
          {
            id: 'stream-1',
            type: 'ai',
            content: '',
            extra_metadata: {
              additional_kwargs: { reasoning_content: '先分析一下' },
            },
          },
        ]}
      />,
    );

    expect(await screen.findByText('先分析一下')).toBeTruthy();
    const trigger = screen.getByRole('button', { name: /Thinking/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
  });

  it('有正文但标记了 error_type 时同时显示正文与提示', async () => {
    render(
      <MessageList
        messages={[
          human(1, '问题'),
          assistant(2, { content: '半截回答', error_type: 'interrupted' }),
        ]}
      />,
    );

    expect(await findBodyText('半截回答')).toBeTruthy();
    expect(screen.getByText('回答生成已中断')).toBeTruthy();
  });

  it('思维链默认收起，展开后与正文分开显示', async () => {
    render(
      <MessageList
        messages={[
          human(1, '问题'),
          assistant(2, {
            content: '答案',
            extra_metadata: { additional_kwargs: { reasoning_content: '推理内容' } },
          }),
        ]}
      />,
    );

    expect(await findBodyText('答案')).toBeTruthy();
    expect(screen.queryByText('推理内容')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /推理过程/ }));

    expect(screen.getByText('推理内容')).toBeTruthy();
  });

  it('error_type 有值时给出中文说明，未登记的码原样展示', () => {
    render(
      <MessageList
        messages={[
          human(1, '问题一'),
          assistant(2, { content: '', error_type: 'interrupted' }),
          human(3, '问题二'),
          assistant(4, { content: '', error_type: 'brand_new' }),
        ]}
      />,
    );

    expect(screen.getByText('回答生成已中断')).toBeTruthy();
    expect(screen.getByText('brand_new')).toBeTruthy();
  });

  it('流式消息接在历史之后，且样式上是最后一轮', async () => {
    render(
      <MessageList
        messages={[human(1, '问题'), assistant(2, { content: '已落库回答' })]}
        streamingMessages={[{ id: 'stream-1', type: 'ai', content: '正在输出' }]}
        isProcessing
      />,
    );

    expect(screen.getAllByTestId('conversation')).toHaveLength(2);
    expect(await findBodyText('正在输出')).toBeTruthy();
    // 流式那一轮不折叠，正在输出的内容必须直接可见
    expect(await findBodyText('已落库回答')).toBeTruthy();
  });
});

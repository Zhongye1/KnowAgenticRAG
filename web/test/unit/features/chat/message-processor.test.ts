import { describe, expect, it } from 'vitest';

import {
  attachToolResults,
  parseAssistantMessageBody,
  splitStreamedChunks,
  toConversations,
  type StreamedChunk,
} from '@/features/chat/lib/message-processor';
import type { ConversationMessage } from '@/features/chat/lib/message-processor';
import type { ChatMessage } from '@/features/chat/api/agent-api';

const human = (id: number, content: string): ChatMessage => ({
  id,
  type: 'human',
  content,
});

const assistant = (id: number, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  type: 'ai',
  content: '',
  ...extra,
});

describe('parseAssistantMessageBody', () => {
  it('优先使用后端分离出来的思维链', () => {
    const body = parseAssistantMessageBody(
      assistant(1, {
        content: '答案',
        extra_metadata: { additional_kwargs: { reasoning_content: '思考' } },
      }),
    );

    expect(body).toEqual({ content: '答案', reasoningContent: '思考' });
  });

  it('没有分离字段时从 <think> 标签里提取，并从正文中移除', () => {
    const body = parseAssistantMessageBody(
      assistant(1, { content: '<think>先算一步</think>结论是 42' }),
    );

    expect(body.content).toBe('结论是 42');
    expect(body.reasoningContent).toBe('先算一步');
  });

  it('未闭合的 <think> 也按思维链处理，避免半截标签留在正文', () => {
    const body = parseAssistantMessageBody(
      assistant(1, { content: '开头<think>还在想' }),
    );

    expect(body.content).toBe('开头');
    expect(body.reasoningContent).toBe('还在想');
  });

  it('普通正文原样返回，思维链为空', () => {
    expect(parseAssistantMessageBody(assistant(1, { content: ' 你好 ' }))).toEqual({
      content: '你好',
      reasoningContent: '',
    });
    expect(parseAssistantMessageBody(null)).toEqual({
      content: '',
      reasoningContent: '',
    });
  });
});

describe('toConversations', () => {
  it('按用户消息切成多轮，每轮标出最后的助手消息', () => {
    const conversations = toConversations([
      human(1, '第一问'),
      assistant(2, { content: '中间' }),
      assistant(3, { content: '最终回答' }),
      human(4, '第二问'),
      assistant(5, { content: '第二答' }),
    ]);

    expect(conversations).toHaveLength(2);
    expect(conversations[0]?.messages.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(conversations[0]?.messages[2]?.isLast).toBe(true);
    expect(conversations[0]?.status).toBe('finished');
    expect(conversations[1]?.messages.map((item) => item.id)).toEqual([4, 5]);
    expect(conversations[1]?.messages[1]?.isLast).toBe(true);
  });

  it('只有 human 与 ai 进入轮次，其余角色被忽略', () => {
    const conversations = toConversations([
      human(1, '第一问'),
      { id: 2, type: 'tool', content: '工具输出' },
      {
        id: 3,
        type: 'human',
        content: '',
        extra_metadata: { source: 'ask_user_question_resume' },
      },
      assistant(4, { content: '回答' }),
    ]);

    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.messages.map((item) => item.id)).toEqual([1, 4]);
  });

  it('助手消息出现在用户消息之前时被忽略，不产生空轮次', () => {
    const conversations = toConversations([
      assistant(1, { content: '孤儿' }),
      human(2, '问答'),
    ]);

    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.messages.map((item) => item.id)).toEqual([2]);
    // 还没收尾：这一轮只有用户消息
    expect(conversations[0]?.status).toBe('loading');
  });

  it('空历史返回空数组', () => {
    expect(toConversations([])).toEqual([]);
    expect(toConversations(null)).toEqual([]);
  });
});

describe('splitStreamedChunks 与 attachToolResults', () => {
  it('把工具结果分片与 AI 消息分开，结果按 tool_call_id 建表', () => {
    const { messages, toolResults } = splitStreamedChunks([
      [
        'ai-1',
        [
          { content: '先执行' },
          {
            tool_call_chunks: [{ index: 0, id: 'call-1', name: 'bash', args: '{"cmd"' }],
          },
          { tool_call_chunks: [{ index: 0, args: ':"ls"}' }] },
        ],
      ],
      [
        'call-1',
        [{ type: 'tool', id: 'call-1', content: '文件列表' } as StreamedChunk],
      ],
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('先执行');
    expect(messages[0]?.tool_calls?.[0]?.function?.arguments).toBe('{"cmd":"ls"}');
    expect(toolResults.get('call-1')).toBe('文件列表');
  });

  it('只有思维链的消息也保留，纯空分片被丢掉', () => {
    const { messages } = splitStreamedChunks([
      ['ai-1', [{ reasoning_content: '在想' }]],
      ['ai-2', [{ content: '' }]],
    ]);

    expect(messages.map((message) => message.id)).toEqual(['ai-1']);
  });

  it('结果并回对应的工具调用，其它调用保持进行中', () => {
    const messages: ConversationMessage[] = [
      {
        id: 'ai-1',
        type: 'ai',
        content: '',
        tool_calls: [
          { index: 0, id: 'call-1', function: { name: 'bash', arguments: '{}' } },
          { index: 1, id: 'call-2', function: { name: 'grep', arguments: '{}' } },
        ],
      },
    ];

    const [attached] = attachToolResults(
      messages,
      new Map([['call-1', '文件列表']]),
    );

    expect(attached?.tool_calls?.[0]?.tool_call_result).toEqual({
      content: '文件列表',
    });
    expect(attached?.tool_calls?.[0]?.status).toBe('success');
    expect(attached?.tool_calls?.[1]?.tool_call_result).toBeUndefined();
    // 不修改原对象：消息数组是运行时的权威状态
    expect(messages[0]?.tool_calls?.[0]?.tool_call_result).toBeUndefined();
  });

  it('已有结果或没有结果的调用不被覆盖', () => {
    const messages: ConversationMessage[] = [
      {
        id: 'ai-1',
        type: 'ai',
        content: '',
        tool_calls: [
          {
            id: 'call-1',
            function: { name: 'bash' },
            tool_call_result: { content: '旧结果' },
          },
        ],
      },
    ];

    const [attached] = attachToolResults(
      messages,
      new Map([['call-1', '新结果']]),
    );

    expect(attached?.tool_calls?.[0]?.tool_call_result).toEqual({
      content: '旧结果',
    });
  });
});

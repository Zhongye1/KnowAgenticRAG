import { describe, expect, it } from 'vitest';

import {
  CHAT_HISTORY_MAX_MESSAGES,
  buildChatParam,
  extractAttachments,
  extractMessageText,
  type ChatSourceMessage,
} from '../lib/chat-param';

const user = (text: string): ChatSourceMessage => ({
  role: 'user',
  content: [{ type: 'text', text }],
});

const assistant = (text: string): ChatSourceMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text }],
});

describe('extractMessageText', () => {
  it('拼接文本部分并忽略非文本部分', () => {
    expect(
      extractMessageText({
        role: 'user',
        content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }],
      }),
    ).toBe('a\nb');
  });
});

describe('buildChatParam', () => {
  it('最后一条 user 消息为 query_text，其余进入 history', () => {
    const param = buildChatParam([
      user('第一问'),
      assistant('第一答'),
      user('第二问'),
    ]);
    expect(param).toEqual({
      query_text: '第二问',
      history: [
        { role: 'user', content: '第一问' },
        { role: 'assistant', content: '第一答' },
      ],
      model: undefined,
      thinking_level: undefined,
      attachments: [],
    });
  });

  it('透传 overrides（model / thinking_level）', () => {
    const param = buildChatParam([user('问')], {
      model: 'mock:qwen2.5-72b-instruct',
      thinkingLevel: 'high',
    });
    expect(param).toMatchObject({
      model: 'mock:qwen2.5-72b-instruct',
      thinking_level: 'high',
    });
  });

  it('随问附件块剥离为结构化 attachments，query_text 去除标记', () => {
    const text =
      '帮我看看这个文件\n<attachment filename="notes.md">\n# 笔记正文\n</attachment>';
    const param = buildChatParam([user(text)]);
    expect(param!.query_text).toBe('帮我看看这个文件');
    expect(param!.attachments).toEqual([
      { filename: 'notes.md', content: '# 笔记正文' },
    ]);
  });

  it('history 中的附件块同样被剥离', () => {
    const param = buildChatParam([
      user('上一问\n<attachment filename="old.txt">\n旧内容\n</attachment>'),
      assistant('上一答'),
      user('新问题'),
    ]);
    expect(param!.history).toEqual([
      { role: 'user', content: '上一问' },
      { role: 'assistant', content: '上一答' },
    ]);
  });

  it('extractAttachments 丢弃超限与空附件', () => {
    const text =
      '<attachment filename="empty.txt">\n   \n</attachment>' +
      `<attachment filename="big.txt">\n${'x'.repeat(40_000)}\n</attachment>`;
    const { attachments, text: stripped } = extractAttachments(text);
    expect(stripped).toBe('');
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe('big.txt');
    expect(attachments[0].content.length).toBeLessThanOrEqual(32_000);
  });

  it('过滤 system 角色与空文本消息', () => {
    const param = buildChatParam([
      { role: 'system', content: [{ type: 'text', text: 'sys' }] },
      user('问'),
      { role: 'assistant', content: [{ type: 'text', text: '  ' }] },
    ]);
    expect(param).toEqual({
      query_text: '问',
      history: [],
      model: undefined,
      thinking_level: undefined,
      attachments: [],
    });
  });

  it('没有 user 消息时返回 null', () => {
    expect(buildChatParam([assistant('答')])).toBeNull();
    expect(buildChatParam([])).toBeNull();
  });

  it('history 超长时仅保留最近 N 条', () => {
    const messages: ChatSourceMessage[] = [];
    for (let i = 0; i < CHAT_HISTORY_MAX_MESSAGES + 5; i += 1) {
      messages.push(user(`q${i}`), assistant(`a${i}`));
    }
    messages.push(user('最新问题'));

    const param = buildChatParam(messages);
    expect(param).not.toBeNull();
    expect(param!.history).toHaveLength(CHAT_HISTORY_MAX_MESSAGES);
    expect(param!.history[0].content).toBe('q10');
    expect(param!.history.at(-1)!.content).toBe('a14');
    expect(param!.query_text).toBe('最新问题');
  });
});

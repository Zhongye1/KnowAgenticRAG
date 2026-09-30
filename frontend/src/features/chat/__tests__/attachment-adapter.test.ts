import { describe, expect, it } from 'vitest';

import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_MAX_BYTES,
  ChatTextAttachmentAdapter,
} from '../lib/attachment-adapter';

describe('ChatTextAttachmentAdapter', () => {
  it('accept 覆盖轻量文本类型', () => {
    expect(CHAT_ATTACHMENT_ACCEPT).toContain('.md');
    expect(CHAT_ATTACHMENT_ACCEPT).toContain('.txt');
    expect(CHAT_ATTACHMENT_ACCEPT).toContain('.json');
    expect(CHAT_ATTACHMENT_ACCEPT).not.toContain('.pdf');
  });

  it('超限文件被拒绝', async () => {
    const adapter = new ChatTextAttachmentAdapter();
    const big = new File(
      ['x'.repeat(CHAT_ATTACHMENT_MAX_BYTES + 1)],
      'big.txt',
      {
        type: 'text/plain',
      },
    );
    await expect(adapter.add({ file: big })).rejects.toThrow(/超过 32KB/);
  });

  it('send 产出 attachment 文本块（filename + 正文）', async () => {
    const adapter = new ChatTextAttachmentAdapter();
    const file = new File(['RAG 配置示例'], 'notes.txt', {
      type: 'text/plain',
    });
    const pending = await adapter.add({ file });
    expect(pending.name).toBe('notes.txt');

    const complete = await adapter.send(pending);
    expect(complete.content).toHaveLength(1);

    // ThreadUserMessagePart 是联合类型，只有 text 分支带 text 字段，先收窄再断言
    const [part] = complete.content;
    expect(part.type).toBe('text');
    if (part.type !== 'text') throw new Error('附件应产出文本块');

    expect(part.text).toContain('<attachment filename="notes.txt">');
    expect(part.text).toContain('RAG 配置示例');
    expect(part.text.endsWith('</attachment>')).toBe(true);
  });
});

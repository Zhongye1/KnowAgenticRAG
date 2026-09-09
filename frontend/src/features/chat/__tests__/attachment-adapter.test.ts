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
    const big = new File(['x'.repeat(CHAT_ATTACHMENT_MAX_BYTES + 1)], 'big.txt', {
      type: 'text/plain',
    });
    await expect(adapter.add({ file: big })).rejects.toThrow(/超过 32KB/);
  });

  it('send 产出 attachment 文本块（filename + 正文）', async () => {
    const adapter = new ChatTextAttachmentAdapter();
    const file = new File(['RAG 配置示例'], 'notes.txt', { type: 'text/plain' });
    const pending = await adapter.add({ file });
    expect(pending.name).toBe('notes.txt');

    const complete = await adapter.send(pending);
    expect(complete.content).toHaveLength(1);
    expect(complete.content[0].type).toBe('text');
    expect(complete.content[0].text).toContain('<attachment filename="notes.txt">');
    expect(complete.content[0].text).toContain('RAG 配置示例');
    expect(complete.content[0].text.endsWith('</attachment>')).toBe(true);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '@/features/chat/api/agent-api';
import { MessageItem } from '@/features/chat/ui/message-item';

const human = (extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 1,
  type: 'human',
  content: '你好',
  ...extra,
});

/** jsdom 没有剪贴板实现；按用例需要装一个成功或失败的桩。 */
const installClipboard = (writeText: () => Promise<void>) => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  });
};

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
});

describe('用户消息的复制按钮', () => {
  it('复制成功后按钮文案换成已复制', async () => {
    installClipboard(() => Promise.resolve());
    render(<MessageItem message={human()} />);

    await userEvent.click(screen.getByRole('button', { name: '复制消息' }));

    expect(await screen.findByRole('button', { name: '已复制' })).toBeTruthy();
  });

  it('复制失败时不显示已复制，并留下错误记录', async () => {
    installClipboard(() => Promise.reject(new Error('denied')));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MessageItem message={human()} />);

    await userEvent.click(screen.getByRole('button', { name: '复制消息' }));

    expect(screen.queryByRole('button', { name: '已复制' })).toBeNull();
    expect(logged).toHaveBeenCalled();
  });

  it('环境没有剪贴板 API 时按钮不假装成功', async () => {
    Reflect.deleteProperty(navigator, 'clipboard');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<MessageItem message={human()} />);

    await userEvent.click(screen.getByRole('button', { name: '复制消息' }));

    expect(screen.queryByRole('button', { name: '已复制' })).toBeNull();
    expect(logged).toHaveBeenCalled();
  });
});

describe('用户消息的附件列表', () => {
  it('渲染附件名与「类型 · 大小」', () => {
    render(
      <MessageItem
        message={human({
          extra_metadata: {
            attachments: [
              { file_id: 'f-1', file_name: '报表.pdf', file_size: 2048 },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText('报表.pdf')).toBeTruthy();
    expect(screen.getByText('PDF · 2 KB')).toBeTruthy();
  });

  it('没有附件时不渲染列表', () => {
    render(<MessageItem message={human()} />);

    expect(screen.queryByRole('list')).toBeNull();
  });

  it('附件字段缺失的条目被丢掉，不渲染空壳', () => {
    render(
      <MessageItem
        message={human({ extra_metadata: { attachments: [{}, null] } })}
      />,
    );

    expect(screen.queryByRole('list')).toBeNull();
  });
});

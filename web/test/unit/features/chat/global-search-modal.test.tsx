import * as React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: { searchThreads: vi.fn() },
}));

vi.mock('@/features/chat/api/agent-api', () => ({
  chatThreadApi: { searchThreads: api.searchThreads },
}));

const { GlobalSearchModal } = await import(
  '@/features/chat/ui/global-search-modal'
);

const resultItem = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  thread_id: id,
  agent_id: 'default-chatbot',
  title: id,
  matched_count: 1,
  latest_match_at: '2026-10-08T00:00:00Z',
  snippets: [{ message_id: 1, content: `关于${id}的片段`, created_at: '2026-10-08T00:00:00Z' }],
  ...extra,
});

const searchResponse = (
  items: unknown[],
  hasMore = false,
) => ({ items, has_more: hasMore, limit: 20, offset: 0 });

const renderModal = (
  props: Partial<React.ComponentProps<typeof GlobalSearchModal>> = {},
) => {
  const onOpenChange = vi.fn();
  const onSelectThread = vi.fn();
  render(
    <GlobalSearchModal
      open
      onOpenChange={onOpenChange}
      recentThreads={[
        { id: '最近一', agent_id: 'a', title: '最近一', updated_at: '2026-10-08T00:00:00Z' },
        { id: '更早一', agent_id: 'a', title: '更早一', updated_at: '2026-01-01T00:00:00Z' },
      ]}
      onSelectThread={onSelectThread}
      {...props}
    />,
  );
  return { onOpenChange, onSelectThread };
};

/** 把结果列表滚到底：jsdom 不布局，尺寸与位置都要手写。 */
const scrollToBottom = () => {
  const list = screen.getByTestId('global-search-results');
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 400 });
  Object.defineProperty(list, 'scrollTop', { configurable: true, value: 590 });
  fireEvent.scroll(list);
};

const typeQuery = async (text: string) => {
  const input = screen.getByLabelText('搜索历史会话');
  await userEvent.clear(input);
  await userEvent.type(input, text);
};

describe('全局会话搜索', () => {
  beforeEach(() => {
    api.searchThreads.mockReset();
    api.searchThreads.mockResolvedValue(searchResponse([]));
  });

  it('未输入时显示新对话与最近会话分组，不发请求', () => {
    renderModal();

    expect(screen.getByRole('button', { name: /新对话/ })).toBeTruthy();
    expect(screen.getByText('前 7 天')).toBeTruthy();
    expect(screen.getByText('更早')).toBeTruthy();
    expect(screen.getByRole('button', { name: /最近一/ })).toBeTruthy();
    expect(api.searchThreads).not.toHaveBeenCalled();
  });

  it('输入后按防抖发一次请求，并按会话渲染片段与高亮', async () => {
    api.searchThreads.mockResolvedValue(
      searchResponse([resultItem('队列设计', { snippets: [{ message_id: 1, content: '聊了队列的取舍' }] })]),
    );
    renderModal();

    await typeQuery('队列');

    await waitFor(() => expect(api.searchThreads).toHaveBeenCalledTimes(1));
    expect(api.searchThreads).toHaveBeenCalledWith({ query: '队列', limit: 20 });
    const row = await screen.findByRole('button', { name: /队列设计/ });
    expect(within(row).getByText('队列')).toBeTruthy();
  });

  it('没有命中时给出明确的空态文案', async () => {
    renderModal();

    await typeQuery('不存在的词');

    expect(await screen.findByText('未找到相关对话')).toBeTruthy();
  });

  it('防抖是 240ms：提前不请求，满 240ms 才请求', async () => {
    vi.useFakeTimers();
    try {
      renderModal();
      fireEvent.change(screen.getByLabelText('搜索历史会话'), {
        target: { value: '队列' },
      });

      await act(async () => {
        vi.advanceTimersByTime(239);
      });
      expect(api.searchThreads).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(api.searchThreads).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('搜索失败时给出文案与重试，而不是伪装成没有结果', async () => {
    api.searchThreads.mockRejectedValueOnce(new Error('500'));
    renderModal();

    await typeQuery('队列');

    expect(await screen.findByText('搜索失败，请重试。')).toBeTruthy();
    expect(screen.queryByText('未找到相关对话')).toBeNull();

    api.searchThreads.mockResolvedValue(searchResponse([resultItem('重试成功')]));
    await userEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByRole('button', { name: /重试成功/ })).toBeTruthy();
  });

  it('滚到底按已加载条数加载下一页', async () => {
    api.searchThreads
      .mockResolvedValueOnce(
        searchResponse(
          Array.from({ length: 20 }, (_, index) => resultItem(`第${index}条`)),
          true,
        ),
      )
      .mockResolvedValueOnce(searchResponse([resultItem('第二页')]));

    renderModal();
    await typeQuery('条');
    expect(await screen.findByRole('button', { name: /第0条/ })).toBeTruthy();

    scrollToBottom();

    await waitFor(() =>
      expect(api.searchThreads).toHaveBeenLastCalledWith({
        query: '条',
        limit: 20,
        offset: 20,
      }),
    );
    expect(await screen.findByRole('button', { name: /第二页/ })).toBeTruthy();
  });

  it('迟到的旧响应不会覆盖新结果', async () => {
    let resolveSlow!: (value: unknown) => void;
    api.searchThreads
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSlow = resolve;
        }),
      )
      .mockResolvedValueOnce(searchResponse([resultItem('新结果')]));
    renderModal();

    await typeQuery('旧');
    await waitFor(() => expect(api.searchThreads).toHaveBeenCalledTimes(1));
    await typeQuery('新');
    expect(await screen.findByRole('button', { name: /新结果/ })).toBeTruthy();

    // 用 act 包住：否则这次迟到的 setState 可能还没 flush，断言会假通过
    await act(async () => {
      resolveSlow(searchResponse([resultItem('旧结果')]));
    });

    expect(screen.queryByRole('button', { name: /旧结果/ })).toBeNull();
    expect(screen.getByRole('button', { name: /新结果/ })).toBeTruthy();
  });

  it('键盘上下移动选中项，回车打开当前项', async () => {
    api.searchThreads.mockResolvedValue(
      searchResponse([resultItem('第一条'), resultItem('第二条')]),
    );
    const { onSelectThread } = renderModal();

    await typeQuery('条');
    expect(await screen.findByRole('button', { name: /第一条/ })).toBeTruthy();

    const modal = screen.getByTestId('global-search-modal');
    fireEvent.keyDown(modal, { key: 'ArrowDown' });
    expect(
      screen.getByRole('button', { name: /第二条/ }).getAttribute('aria-current'),
    ).toBe('true');

    fireEvent.keyDown(modal, { key: 'Enter' });

    expect(onSelectThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: '第二条' }),
    );
  });

  it('Esc 关闭弹窗', async () => {
    const { onOpenChange } = renderModal();

    fireEvent.keyDown(screen.getByTestId('global-search-modal'), {
      key: 'Escape',
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('点击结果把会话写回调用方并关闭，且不带回被写死的线程状态', async () => {
    api.searchThreads.mockResolvedValue(
      searchResponse([
        resultItem('命中', {
          id: 'thread-命中',
          thread_id: 'thread-命中',
          thread_status: 'done',
        }),
      ]),
    );
    const { onOpenChange, onSelectThread } = renderModal();

    await typeQuery('命中');
    await userEvent.click(await screen.findByRole('button', { name: /命中/ }));

    // 搜索接口不返回真实状态（模型默认 done），带回去会抹掉侧边栏的运行中/未读标记
    const [selected] = onSelectThread.mock.calls[0] as [Record<string, unknown>];
    expect(selected).not.toHaveProperty('thread_status');
    expect(selected.id).toBe('thread-命中');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('默认视图的「新对话」以 null 交给调用方', async () => {
    const { onSelectThread } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: /新对话/ }));

    expect(onSelectThread).toHaveBeenCalledWith(null);
  });

  it('关闭后重新打开会重置查询与结果', async () => {
    // 受控组件：关闭由弹窗自己发起（Esc），父级只是把 open 设为 false
    const Harness = () => {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            重新打开
          </button>
          <GlobalSearchModal
            open={open}
            onOpenChange={setOpen}
            recentThreads={[]}
            onSelectThread={vi.fn()}
          />
        </>
      );
    };
    render(<Harness />);
    api.searchThreads.mockResolvedValue(searchResponse([resultItem('旧查询结果')]));
    await typeQuery('旧查询');
    expect(await screen.findByRole('button', { name: /旧查询结果/ })).toBeTruthy();

    fireEvent.keyDown(screen.getByTestId('global-search-modal'), {
      key: 'Escape',
    });
    await waitFor(() =>
      expect(screen.queryByTestId('global-search-modal')).toBeNull(),
    );

    await userEvent.click(screen.getByRole('button', { name: '重新打开' }));

    expect(screen.getByLabelText<HTMLInputElement>('搜索历史会话').value).toBe('');
    expect(await screen.findByText('暂无对话历史')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /旧查询结果/ })).toBeNull();
  });

  it('打开时焦点落在搜索框，键盘可以直接输入', async () => {
    renderModal();

    expect(document.activeElement).toBe(screen.getByLabelText('搜索历史会话'));
  });

  it('没有下一页时滚动不再请求', async () => {
    api.searchThreads.mockResolvedValue(searchResponse([resultItem('只有一条')]));
    renderModal();
    await typeQuery('一条');
    expect(await screen.findByRole('button', { name: /只有一条/ })).toBeTruthy();
    expect(api.searchThreads).toHaveBeenCalledTimes(1);

    scrollToBottom();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.searchThreads).toHaveBeenCalledTimes(1);
  });

  it('加载更多返回时查询已经改过，旧的一页不会追加进新结果', async () => {
    let resolveMore!: (value: unknown) => void;
    api.searchThreads
      .mockResolvedValueOnce(
        searchResponse(
          Array.from({ length: 20 }, (_, index) => resultItem(`旧${index}`)),
          true,
        ),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveMore = resolve;
        }),
      )
      .mockResolvedValueOnce(searchResponse([resultItem('新词结果')]));
    renderModal();
    await typeQuery('旧');
    expect(await screen.findByRole('button', { name: /旧0/ })).toBeTruthy();

    scrollToBottom();
    await waitFor(() => expect(api.searchThreads).toHaveBeenCalledTimes(2));
    await typeQuery('新词');
    expect(await screen.findByRole('button', { name: /新词结果/ })).toBeTruthy();

    await act(async () => {
      resolveMore(searchResponse([resultItem('旧第二页')], true));
    });

    expect(screen.queryByRole('button', { name: /旧第二页/ })).toBeNull();
    expect(screen.getByRole('button', { name: /新词结果/ })).toBeTruthy();
  });

  it('向上移动选中项并循环到末尾', async () => {
    api.searchThreads.mockResolvedValue(
      searchResponse([resultItem('一'), resultItem('二'), resultItem('三')]),
    );
    const { onSelectThread } = renderModal();
    await typeQuery('条');
    expect(await screen.findByRole('button', { name: /一/ })).toBeTruthy();

    const modal = screen.getByTestId('global-search-modal');
    fireEvent.keyDown(modal, { key: 'ArrowUp' });
    expect(
      screen.getByRole('button', { name: /三/ }).getAttribute('aria-current'),
    ).toBe('true');

    fireEvent.keyDown(modal, { key: 'Enter' });

    expect(onSelectThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: '三' }),
    );
  });

  it('改变查询后选中项回到第一行', async () => {
    api.searchThreads.mockResolvedValue(
      searchResponse([resultItem('甲'), resultItem('乙')]),
    );
    renderModal();
    await typeQuery('第一次');
    expect(await screen.findByRole('button', { name: /甲/ })).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('global-search-modal'), {
      key: 'ArrowDown',
    });
    expect(
      screen.getByRole('button', { name: /乙/ }).getAttribute('aria-current'),
    ).toBe('true');

    await typeQuery('第二次');

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /甲/ }).getAttribute('aria-current'),
      ).toBe('true'),
    );
  });
});

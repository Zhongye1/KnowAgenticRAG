/**
 * 消息调试面板：筛选/搜索/展开/复制、按 run 分组、Langfuse 打开与失败提示。
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动，全套件并行跑时会超过默认 5 秒预算；
 * 这里给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

const { MessageDebugPanel } =
  await import('@/features/chat/ui/message-debug-panel');

const MESSAGES = [
  {
    id: 'm-1',
    type: 'human',
    content: '你好',
    run_id: 'run_abcdefghijklmnopqrst',
  },
  {
    id: 'm-2',
    type: 'ai',
    content: '你好呀',
    run_id: 'run_abcdefghijklmnopqrst',
    usage: { total_tokens: 1200, prompt_tokens: 800, completion_tokens: 400 },
  },
  { id: 'm-3', type: 'tool', name: 'search_kb', content: '结果', run_id: null },
];

const writeText = vi.fn();
const open = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  open.mockReset();
  Object.assign(navigator, { clipboard: { writeText } });
  vi.stubGlobal('open', open);
});

describe('消息调试面板', () => {
  it('按角色给出数量并默认显示全部，按连续 run 分组', () => {
    render(<MessageDebugPanel messages={MESSAGES} />);

    expect(screen.getByText('消息时序调试')).toBeTruthy();
    expect(screen.getByText('3 条')).toBeTruthy();
    expect(screen.getByRole('button', { name: /全部 3/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /用户 1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /AI 1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /工具 1/ })).toBeTruthy();
    // 两个 run 分组：有 run id 的与未关联的
    expect(
      screen.getByLabelText(/^Run run_abcdefghijklmnopqrst$/),
    ).toBeTruthy();
    expect(screen.getByLabelText('未关联 Run')).toBeTruthy();
    expect(screen.getByText('run_abcd…opqrst')).toBeTruthy();
  });

  it('角色筛选与搜索都会缩窄列表', async () => {
    render(<MessageDebugPanel messages={MESSAGES} />);

    await userEvent.click(screen.getByRole('button', { name: /工具 1/ }));
    expect(screen.getByText('工具: search_kb | 结果')).toBeTruthy();
    expect(screen.queryByText('你好')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /全部 3/ }));
    await userEvent.type(screen.getByLabelText('搜索消息或字段'), '你好呀');
    expect(screen.getByText('你好呀')).toBeTruthy();
    expect(screen.queryByText('工具: search_kb | 结果')).toBeNull();
  });

  it('没有命中时给搜索空态，完全没有消息时给会话空态', async () => {
    const { unmount } = render(<MessageDebugPanel messages={MESSAGES} />);
    await userEvent.type(
      screen.getByLabelText('搜索消息或字段'),
      '找不到的东西',
    );
    expect(screen.getByText('未找到匹配的消息')).toBeTruthy();
    unmount();

    render(<MessageDebugPanel messages={[]} />);
    expect(screen.getByText('当前会话暂无消息数据')).toBeTruthy();
  });

  it('展开单条看原始 JSON', async () => {
    render(<MessageDebugPanel messages={MESSAGES} />);

    // 只展开一条时按钮仍是「全部展开」（isAllExpanded 要求当前可见项都展开）
    expect(screen.getByRole('button', { name: /全部展开/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '你好' }));
    expect(screen.getByText(/"content": "你好"/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /全部展开/ })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '你好' }));
    expect(screen.queryByText(/"content": "你好"/)).toBeNull();
  });

  it('全部展开再全部折叠，作用于当前筛选后的可见项', async () => {
    render(<MessageDebugPanel messages={MESSAGES} />);

    await userEvent.click(screen.getByRole('button', { name: /全部展开/ }));
    expect(screen.getByRole('button', { name: /全部折叠/ })).toBeTruthy();
    expect(screen.getByText(/"content": "你好"/)).toBeTruthy();
    expect(screen.getByText(/"content": "你好呀"/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /全部折叠/ }));
    expect(screen.getByRole('button', { name: /全部展开/ })).toBeTruthy();
    expect(screen.queryByText(/"content": "你好"/)).toBeNull();

    // 只看工具时「全部展开」只影响工具那一条
    await userEvent.click(screen.getByRole('button', { name: /工具 1/ }));
    await userEvent.click(screen.getByRole('button', { name: /全部展开/ }));
    expect(screen.getByText(/"name": "search_kb"/)).toBeTruthy();
  });

  it('复制单条与复制全部都走剪贴板', async () => {
    render(<MessageDebugPanel messages={MESSAGES} />);

    await userEvent.click(
      screen.getByRole('button', { name: '复制第 m-1 条消息' }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('"id": "m-1"');

    await userEvent.click(screen.getByRole('button', { name: /复制数据/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: /已复制/ })).toBeTruthy();
  });

  it('复制失败给出提示而不是静默', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<MessageDebugPanel messages={MESSAGES} />);

    await userEvent.click(
      screen.getByRole('button', { name: '复制第 m-1 条消息' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '复制失败，请检查浏览器剪贴板权限。',
    );
  });

  it('点 Langfuse 用后端给的链接新开窗口', async () => {
    const fetchUrl = vi
      .fn()
      .mockResolvedValue({
        available: true,
        url: 'https://lf.example/trace/1',
      });
    render(
      <MessageDebugPanel messages={MESSAGES} fetchLangfuseUrl={fetchUrl} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Langfuse/ }));

    await waitFor(() =>
      expect(fetchUrl).toHaveBeenCalledWith('run_abcdefghijklmnopqrst'),
    );
    expect(open).toHaveBeenCalledWith(
      'https://lf.example/trace/1',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('后端说没有链接时给提示且不打开窗口', async () => {
    const fetchUrl = vi.fn().mockResolvedValue({ available: false });
    render(
      <MessageDebugPanel messages={MESSAGES} fetchLangfuseUrl={fetchUrl} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Langfuse/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '这次 Run 没有可打开的 Langfuse 链接。',
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('没有 Langfuse 能力时不渲染该按钮', () => {
    render(<MessageDebugPanel messages={MESSAGES} />);

    expect(screen.queryByRole('button', { name: /Langfuse/ })).toBeNull();
  });
});

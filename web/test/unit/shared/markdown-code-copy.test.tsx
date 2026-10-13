import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Markdown } from '@/shared/ui/markdown';

const FENCED = ['```js', 'const answer = 42;', '```'].join('\n');

/**
 * 等渲染管线把代码块落到 DOM 上；它是异步的，且代码会被高亮拆成多个 span，
 * 因此按元素等而不是按整段文本等。
 */
const waitForCodeBlocks = async (container: HTMLElement, count = 1) => {
  // 渲染管线是异步的；整仓并发跑用例时要给它更宽的等待窗口（与 message-list 同做法）
  await waitFor(
    () => expect(container.querySelectorAll('pre')).toHaveLength(count),
    { timeout: 5_000 },
  );
};

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
});

describe('Markdown 的代码复制', () => {
  it('打开 codeCopy 时每个代码块插一个复制按钮', async () => {
    const { container } = render(<Markdown content={FENCED} codeCopy />);
    await waitForCodeBlocks(container);

    // 按钮是渲染完成后另一个 effect 注入的，`<pre>` 出现不代表它已经在了
    expect(
      await screen.findByRole('button', { name: '复制代码' }),
    ).toBeTruthy();
  });

  it('默认不插复制按钮，避免影响知识库与技能详情等调用点', async () => {
    const { container } = render(<Markdown content={FENCED} />);
    await waitForCodeBlocks(container);

    expect(screen.queryByRole('button', { name: '复制代码' })).toBeNull();
  });

  it('代码块数量与按钮数量一致', async () => {
    const { container } = render(
      <Markdown content={`${FENCED}\n\n${FENCED}`} codeCopy />,
    );
    await waitForCodeBlocks(container, 2);

    expect(screen.getAllByRole('button', { name: '复制代码' })).toHaveLength(2);
  });
});

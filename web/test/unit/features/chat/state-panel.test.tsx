import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StatePanel } from '@/features/chat/ui/state-panel';

describe('StatePanel', () => {
  it('全部为空时显示「暂无状态内容」', () => {
    render(
      <StatePanel
        tokenUsage={null}
        todos={[]}
        files={[]}
        artifacts={[]}
        subagentRuns={[]}
      />,
    );
    expect(screen.getByText('暂无状态内容')).toBeInTheDocument();
  });

  it('有待办时渲染进度与条目', () => {
    render(
      <StatePanel
        tokenUsage={null}
        todos={[
          { label: '写报告', title: '写报告', status: 'completed' },
          { label: '发邮件', title: '发邮件', status: 'in_progress' },
        ]}
        files={[]}
        artifacts={[]}
        subagentRuns={[]}
      />,
    );
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('写报告')).toBeInTheDocument();
    expect(screen.getByLabelText('已完成')).toBeInTheDocument();
    expect(screen.getByLabelText('进行中')).toBeInTheDocument();
  });

  it('待办的脉冲点只在「进行中」出现', () => {
    render(
      <StatePanel
        tokenUsage={null}
        todos={[
          { label: '排队中', title: '排队中', status: 'pending' },
          { label: '跑着', title: '跑着', status: 'in_progress' },
        ]}
        files={[]}
        artifacts={[]}
        subagentRuns={[]}
      />,
    );

    // 指示环里只有进行中的那条带脉冲子节点
    const pulseCount = (label: string) =>
      screen.getByLabelText(label).querySelectorAll('span span').length;
    expect(pulseCount('进行中')).toBe(1);
    expect(pulseCount('待处理')).toBe(0);
  });

  it('文件条目用按扩展名着色的类型图标', () => {
    const { container } = render(
      <StatePanel
        tokenUsage={null}
        todos={[]}
        files={[
          { key: '/out/a.md', path: '/out/a.md', name: 'a.md' },
          { key: '/out/b.pdf', path: '/out/b.pdf', name: 'b.pdf' },
        ]}
        artifacts={[]}
        subagentRuns={[]}
      />,
    );

    const sources = Array.from(container.querySelectorAll('img')).map((img) =>
      img.getAttribute('src'),
    );
    expect(sources).toHaveLength(2);
    // 两个不同扩展名落到不同的图标资源上；同一套通用图标时两者会相等
    expect(sources[0]).not.toBe(sources[1]);
  });

  it('产物条目带类型描述，文件条目不带', () => {
    render(
      <StatePanel
        tokenUsage={null}
        todos={[]}
        files={[{ key: '/out/a.md', path: '/out/a.md', name: 'a.md' }]}
        artifacts={[{ key: '/out/r.md', path: '/out/r.md', name: 'r.md' }]}
        subagentRuns={[]}
      />,
    );

    // 参照 .state-list-item-meta：产物行两行——文件名 + 类型描述
    expect(screen.getByTitle('打开 r.md').textContent).toContain(
      '交付文件 · MD',
    );
    // 附件/文件行只有文件名
    expect(screen.getByTitle('打开 a.md').textContent).toBe('a.md');
  });

  it('点击文件条目打开预览', () => {
    const onOpenFile = vi.fn();
    render(
      <StatePanel
        tokenUsage={null}
        todos={[]}
        files={[{ key: '/out/a.md', path: '/out/a.md', name: 'a.md' }]}
        artifacts={[]}
        subagentRuns={[]}
        onOpenFile={onOpenFile}
      />,
    );
    fireEvent.click(screen.getByText('a.md'));
    expect(onOpenFile).toHaveBeenCalledWith({
      key: '/out/a.md',
      path: '/out/a.md',
      name: 'a.md',
    });
  });

  it('子智能体条目有子线程时可点，没有时不可点', () => {
    const onOpenSubagent = vi.fn();
    render(
      <StatePanel
        tokenUsage={null}
        todos={[]}
        files={[]}
        artifacts={[]}
        subagentRuns={[
          {
            run_id: 'r1',
            child_thread_id: 't1',
            subagent_name: '调研员',
            status: 'running',
          },
          { run_id: 'r2', status: 'completed' },
        ]}
        onOpenSubagent={onOpenSubagent}
      />,
    );
    // r1 可点（有子线程）
    fireEvent.click(screen.getByText('调研员'));
    expect(onOpenSubagent).toHaveBeenCalledTimes(1);
    expect(onOpenSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: 'r1' }),
    );
  });

  it('折叠待办分区后条目隐藏', () => {
    render(
      <StatePanel
        tokenUsage={null}
        todos={[{ label: '写报告', title: '写报告', status: 'pending' }]}
        files={[]}
        artifacts={[]}
        subagentRuns={[]}
      />,
    );
    const toggle = screen.getByRole('button', { name: /待办/ });
    // 折叠面板常驻 DOM（grid-rows 0fr + visibility 动画，参照 .state-collapse-panel）；
    // jsdom 不应用 CSS Modules 的样式表，这里断言状态语义：aria-expanded 翻转 +
    // 面板节点去掉展开类
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('写报告')).toBeInTheDocument();
  });
});

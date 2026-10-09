/**
 * 详情面板：节点/关系两种形态的行、截断展开、换元素重置展开态。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * 这套用例逐个靠 userEvent 驱动 Radix 弹窗，全套件并行跑时会超过默认 5 秒预算；
 * 这里给本文件一个明确预算，不放宽全局配置。
 */
vi.setConfig({ testTimeout: 15000 });

import type {
  GraphEdge,
  GraphNode,
} from '@/features/knowledge-base/api/graph-api';
import { TRUNCATE_LIMIT } from '@/features/knowledge-base/lib/graph-detail';

const { GraphDetailPanel } =
  await import('@/features/knowledge-base/ui/graph-detail-panel');

const nodeItem = (extra: Partial<GraphNode> = {}): GraphNode => ({
  id: 'n-1',
  name: '张三',
  original_id: 'n-1',
  type: 'Person',
  labels: ['Person', 'Employee'],
  properties: { age: 30, note: 'x'.repeat(TRUNCATE_LIMIT + 10) },
  normalized: { name: '张三', type: 'Person', source: 'milvus' },
  graph_type: 'milvus',
  ...extra,
});

const edgeItem = (extra: Partial<GraphEdge> = {}): GraphEdge => ({
  id: 'e-1',
  source_id: 'n-1',
  target_id: 'n-2',
  type: 'WORKS_AT',
  properties: { source_id: 'n-1', target_id: 'n-2', weight: 0.8 },
  normalized: { type: 'WORKS_AT', direction: 'directed' },
  ...extra,
});

describe('图谱详情面板', () => {
  it('不可见或没有选中元素时不渲染', () => {
    const { container } = render(
      <GraphDetailPanel
        visible={false}
        item={nodeItem()}
        type="node"
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();

    const second = render(
      <GraphDetailPanel visible item={null} type="node" onClose={vi.fn()} />,
    );
    expect(second.container).toBeEmptyDOMElement();
  });

  it('节点：名称取后端 name、类型单独一行，标签与属性都在', () => {
    render(
      <GraphDetailPanel
        visible
        item={nodeItem()}
        type="node"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('节点详情')).toBeTruthy();
    expect(screen.getByText('名称').nextElementSibling?.textContent).toContain(
      '张三',
    );
    expect(screen.getByText('类型').nextElementSibling?.textContent).toContain(
      'Person',
    );
    expect(screen.getByText('n-1')).toBeTruthy();
    expect(screen.getByText('Employee')).toBeTruthy();
    expect(screen.getByText('age').nextElementSibling?.textContent).toContain(
      '30',
    );
  });

  it('关系：类型一行，端点等内部键不出现', () => {
    render(
      <GraphDetailPanel
        visible
        item={edgeItem()}
        type="edge"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('关系详情')).toBeTruthy();
    expect(screen.getByText('类型').nextElementSibling?.textContent).toContain(
      'WORKS_AT',
    );
    expect(screen.getByText('weight')).toBeTruthy();
    expect(screen.queryByText('source_id')).toBeNull();
    expect(screen.queryByText('target_id')).toBeNull();
  });

  it('超长值先截断，点展开看全文，再点收起', async () => {
    render(
      <GraphDetailPanel
        visible
        item={nodeItem()}
        type="node"
        onClose={vi.fn()}
      />,
    );

    const long = 'x'.repeat(TRUNCATE_LIMIT + 10);
    expect(screen.queryByText(long)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '展开' }));
    expect(screen.getByText(long)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(screen.queryByText(long)).toBeNull();
  });

  it('换一个元素后展开态重置（展开不会跟着键名跑到别的节点）', async () => {
    const { rerender } = render(
      <GraphDetailPanel
        visible
        item={nodeItem()}
        type="node"
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '展开' }));
    expect(screen.getByRole('button', { name: '收起' })).toBeTruthy();

    rerender(
      <GraphDetailPanel
        visible
        item={nodeItem({ id: 'n-2', name: '李四' })}
        type="node"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '展开' })).toBeTruthy();
  });

  it('关闭按钮把动作交给调用方', async () => {
    const onClose = vi.fn();
    render(
      <GraphDetailPanel
        visible
        item={nodeItem()}
        type="node"
        onClose={onClose}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '关闭详情' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('没有属实时给一句说明而不是空白', () => {
    render(
      <GraphDetailPanel
        visible
        item={nodeItem({ properties: {} })}
        type="node"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('没有更多属性。')).toBeTruthy();
  });
});

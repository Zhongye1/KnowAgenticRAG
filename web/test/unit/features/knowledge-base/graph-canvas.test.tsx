/**
 * 画布生命周期：G6 实例的创建时机、数据更新不重建、主题切换重建、卸载销毁与事件回调。
 *
 * jsdom 没有 canvas，因此这里把 `@antv/g6` 换成记录调用的替身——断言的是我们交给 G6 的
 * 选项与调用序列（这正是移植风险所在），真实绘制由浏览器验证负责。
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakeGraph = {
  options: Record<string, unknown>;
  handlers: Map<string, (event: unknown) => void>;
  setData: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  fitCenter: ReturnType<typeof vi.fn>;
  fitView: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

const { instances, pendingRenders } = vi.hoisted(() => ({
  instances: [] as FakeGraph[],
  /** 每次 render() 的 resolver：用例自己决定什么时候「画完」。 */
  pendingRenders: [] as Array<() => void>,
}));

vi.mock('@antv/g6', () => ({
  Graph: class {
    options: Record<string, unknown>;
    handlers = new Map<string, (event: unknown) => void>();
    setData = vi.fn();
    render = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          pendingRenders.push(resolve);
        }),
    );
    fitCenter = vi.fn(() => Promise.resolve());
    fitView = vi.fn(() => Promise.resolve());
    setSize = vi.fn();
    destroy = vi.fn();
    constructor(options: Record<string, unknown>) {
      this.options = options;
      instances.push(this as unknown as FakeGraph);
    }
    on(event: string, handler: (event: unknown) => void) {
      this.handlers.set(event, handler);
      return this;
    }
  },
}));

const { GraphCanvas } =
  await import('@/features/knowledge-base/ui/graph/graph-canvas');

const node = (id: string) => ({
  id,
  name: id,
  original_id: id,
  type: 'Person',
  labels: ['Person'],
  properties: {},
  normalized: { name: id, type: 'Person', source: 'milvus' },
  graph_type: 'milvus',
});

const view = (nodeIds: string[]) => ({
  nodes: nodeIds.map((id) => ({
    id,
    label: id,
    type: 'Person',
    colorToken: '--data-1',
    degree: 1,
    original: node(id),
  })),
  edges: [
    {
      id: 'e-1',
      label: 'KNOWS',
      type: 'KNOWS',
      colorToken: '--data-2',
      source: nodeIds[0],
      target: nodeIds[1] ?? nodeIds[0],
      original: {
        id: 'e-1',
        source_id: nodeIds[0],
        target_id: nodeIds[1] ?? nodeIds[0],
        type: 'KNOWS',
        properties: {},
        normalized: { type: 'KNOWS', direction: 'directed' },
      },
    },
  ],
});

const renderCanvas = (
  props: Partial<React.ComponentProps<typeof GraphCanvas>> = {},
) => {
  const handlers = {
    onNodeClick: vi.fn(),
    onEdgeClick: vi.fn(),
    onCanvasClick: vi.fn(),
    onDataRendered: vi.fn(),
  };
  const result = render(
    <GraphCanvas view={view(['n-1', 'n-2'])} {...handlers} {...props} />,
  );
  return { ...handlers, ...result };
};

beforeEach(() => {
  instances.length = 0;
  pendingRenders.length = 0;
  document.documentElement.classList.remove('dark');
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800,
    height: 520,
    top: 0,
    left: 0,
    right: 800,
    bottom: 520,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('图谱画布的 G6 生命周期', () => {
  it('画完只在内容放不下时缩放，随后居中（小图不被放大）', async () => {
    renderCanvas();
    const first = instances[0];

    await act(async () => {
      pendingRenders[0]();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(first.fitView).toHaveBeenCalledWith({ when: 'overflow' });
    expect(first.fitCenter).toHaveBeenCalled();
  });

  it('容器有尺寸时按上游布局与行为创建实例，并把数据交给 G6', () => {
    renderCanvas();

    expect(instances).toHaveLength(1);
    const options = instances[0].options;
    expect(options.theme).toBe('light');
    expect((options.layout as { type: string }).type).toBe('d3-force');
    // click-select 按上游显式配置（默认 multiple=false 选不中相邻）
    expect(options.behaviors).toContainEqual(
      expect.objectContaining({
        type: 'click-select',
        multiple: true,
        degree: 1,
        neighborState: 'active',
      }),
    );
    expect(instances[0].setData).toHaveBeenCalledWith({
      nodes: [
        {
          id: 'n-1',
          data: { label: 'n-1', colorToken: '--data-1', degree: 1 },
        },
        {
          id: 'n-2',
          data: { label: 'n-2', colorToken: '--data-1', degree: 1 },
        },
      ],
      edges: [
        {
          id: 'e-1',
          source: 'n-1',
          target: 'n-2',
          data: { label: 'KNOWS', colorToken: '--data-2' },
        },
      ],
    });
  });

  it('数据变化只重画，不重建实例', () => {
    const { rerender, onNodeClick, onEdgeClick, onCanvasClick } =
      renderCanvas();
    const first = instances[0];

    rerender(
      <GraphCanvas
        view={view(['n-1', 'n-2', 'n-3'])}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onCanvasClick={onCanvasClick}
      />,
    );

    expect(instances).toHaveLength(1);
    expect(first.destroy).not.toHaveBeenCalled();
    expect(first.setData).toHaveBeenCalledTimes(2);
  });

  it('同一份数据不会重复 setData（创建时已画过）', () => {
    const { rerender, ...handlers } = renderCanvas();
    const first = instances[0];
    expect(first.setData).toHaveBeenCalledTimes(1);

    rerender(<GraphCanvas view={view(['n-1', 'n-2'])} {...handlers} />);

    expect(first.setData).toHaveBeenCalledTimes(1);
  });

  it('主题切换销毁旧实例并按新主题重建（G6 在创建时快照样式）', async () => {
    renderCanvas();
    const first = instances[0];

    // useIsDarkMode 用 MutationObserver 听 html.dark，回调在微任务里
    await act(async () => {
      document.documentElement.classList.add('dark');
    });

    expect(instances).toHaveLength(2);
    expect(instances[1].options.theme).toBe('dark');

    // 销毁等旧实例的首帧渲染落定（否则 G6 的管线会在销毁后继续跑）
    expect(first.destroy).not.toHaveBeenCalled();
    await act(async () => {
      pendingRenders[0]();
      await Promise.resolve();
    });
    expect(first.destroy).toHaveBeenCalledTimes(1);
  });

  it('销毁之后到达的 render 回调不再碰旧实例', async () => {
    renderCanvas();
    const old = instances[0];
    expect(pendingRenders).toHaveLength(1);

    await act(async () => {
      document.documentElement.classList.add('dark');
    });
    expect(instances).toHaveLength(2);

    // 旧实例的 render 在销毁之后才「画完」
    await act(async () => {
      pendingRenders[0]();
      await Promise.resolve();
    });

    expect(old.fitCenter).not.toHaveBeenCalled();
  });

  it('卸载时销毁实例（等首帧渲染落定后）', async () => {
    const { unmount } = renderCanvas();
    const first = instances[0];

    unmount();
    await act(async () => {
      pendingRenders[0]();
      await Promise.resolve();
    });

    expect(first.destroy).toHaveBeenCalledTimes(1);
  });

  it('节点、关系与空白点击分别回调原始数据', () => {
    const { onNodeClick, onEdgeClick, onCanvasClick } = renderCanvas();
    const handlers = instances[0].handlers;

    handlers.get('node:click')?.({ target: { id: 'n-2' } });
    expect(onNodeClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n-2', type: 'Person' }),
    );

    handlers.get('edge:click')?.({ target: { id: 'e-1' } });
    expect(onEdgeClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e-1', type: 'KNOWS' }),
    );

    handlers.get('canvas:click')?.({});
    expect(onCanvasClick).toHaveBeenCalledTimes(1);
  });

  it('点到已经不在数据里的元素不回调', () => {
    const { onNodeClick } = renderCanvas();

    instances[0].handlers.get('node:click')?.({ target: { id: 'gone' } });

    expect(onNodeClick).not.toHaveBeenCalled();
  });
});

describe('图例', () => {
  it('左下角给实体与关系的计数，点开看类型分布', async () => {
    renderCanvas();

    const entity = screen.getByRole('button', { name: /实体/ });
    const relation = screen.getByRole('button', { name: /关系/ });
    expect(entity).toHaveTextContent('2');
    expect(relation).toHaveTextContent('1');

    // 没点开时没有类型卡
    expect(screen.queryByText('实体类型')).toBeNull();

    await userEvent.click(entity);
    expect(await screen.findByText('实体类型')).toBeTruthy();
    expect(screen.getByText('Person')).toBeTruthy();

    // 再点一次收起
    await userEvent.click(entity);
    expect(screen.queryByText('实体类型')).toBeNull();
  });

  it('空图上不渲染图例', () => {
    renderCanvas({ view: { nodes: [], edges: [] } });

    expect(screen.queryByRole('button', { name: /实体/ })).toBeNull();
  });
});

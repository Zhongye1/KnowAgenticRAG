/**
 * 图谱视图纯逻辑：标签优先级、度数、颜色 token 选择、统计与 token 解析。
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import type {
  GraphEdge,
  GraphNode,
} from '@/features/knowledge-base/api/graph-api';
import {
  describeEdgeType,
  describeNodeType,
  GRAPH_COLOR_TOKENS,
  hashLabel,
  nodeSizeByDegree,
  readPalette,
  resolveGraphColors,
  summarizeGraph,
  toGraphView,
} from '@/features/knowledge-base/lib/graph-view';

const node = (extra: Partial<GraphNode> = {}): GraphNode => ({
  id: 'n-1',
  name: '张三',
  original_id: 'n-1',
  type: 'Person',
  labels: ['Person'],
  properties: {},
  normalized: { name: '张三', type: 'Person', source: 'milvus' },
  graph_type: 'milvus',
  ...extra,
});

const edge = (extra: Partial<GraphEdge> = {}): GraphEdge => ({
  id: 'e-1',
  source_id: 'n-1',
  target_id: 'n-2',
  type: 'WORKS_AT',
  properties: {},
  normalized: { type: 'WORKS_AT', direction: 'directed' },
  ...extra,
});

describe('标签口径', () => {
  it('节点按 type → normalized.type → 属性 label → Entity 取', () => {
    expect(describeNodeType(node())).toBe('Person');
    expect(
      describeNodeType(node({ type: '', normalized: undefined as never })),
    ).toBe('Entity');
    expect(
      describeNodeType(
        node({
          type: '',
          normalized: undefined as never,
          properties: { label: 'Org' },
        }),
      ),
    ).toBe('Org');
  });

  it('边按 type → normalized.type → RELATED_TO 取', () => {
    expect(describeEdgeType(edge())).toBe('WORKS_AT');
    expect(describeEdgeType(edge({ type: '' }))).toBe('WORKS_AT');
    expect(
      describeEdgeType(edge({ type: '', normalized: undefined as never })),
    ).toBe('RELATED_TO');
  });
});

describe('子图转换', () => {
  it('算度数与节点半径（上限 50）', () => {
    const view = toGraphView({
      nodes: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })],
      edges: [
        edge({ id: 'e1', source_id: 'a', target_id: 'b' }),
        edge({ id: 'e2', source_id: 'a', target_id: 'c' }),
      ],
    });

    expect(view.nodes.find((item) => item.id === 'a')?.degree).toBe(2);
    expect(view.nodes.find((item) => item.id === 'b')?.degree).toBe(1);
    expect(nodeSizeByDegree(0)).toBe(15);
    expect(nodeSizeByDegree(2)).toBe(25);
    expect(nodeSizeByDegree(99)).toBe(50);
  });

  it('同一类型总是同一个颜色 token，Chunk 固定中性色', () => {
    const view = toGraphView({
      nodes: [
        node({ id: 'a', type: 'Person', name: '张三' }),
        node({ id: 'b', type: 'Person', name: '李四' }),
        node({ id: 'c', type: 'Chunk', name: 'ch-1' }),
      ],
      edges: [],
    });

    const [first, second, chunk] = view.nodes;
    expect(first.colorToken).toBe(second.colorToken);
    expect(first.colorToken).toMatch(/^--data-\d+$/);
    expect(chunk.colorToken).toBe('--color-fill-3');
  });

  it('画布标签写实体名（同名类型用颜色区分），名称缺失才退回类型', () => {
    const view = toGraphView({
      nodes: [
        node({ id: 'a', type: 'Person', name: '张三' }),
        node({ id: 'b', type: 'Person', name: '李四' }),
        node({ id: 'c', type: 'Person', name: '' }),
      ],
      edges: [],
    });

    expect(view.nodes.map((item) => item.label)).toEqual([
      '张三',
      '李四',
      'Person',
    ]);
    // 三个节点都是 Person：颜色一致、标签不同
    expect(new Set(view.nodes.map((item) => item.colorToken)).size).toBe(1);
  });

  it('节点与边用不同的颜色半边，避免同色', () => {
    const view = toGraphView({
      nodes: [node({ id: 'a' })],
      edges: [edge({ source_id: 'a', target_id: 'a' })],
    });

    expect(view.nodes[0].colorToken).not.toBe(view.edges[0].colorToken);
  });

  it('端点已被过滤掉的边不交给画布（否则 G6 找不到节点）', () => {
    const view = toGraphView({
      nodes: [node({ id: 'a' })],
      edges: [
        edge({ id: 'e1', source_id: 'a', target_id: 'gone' }),
        edge({ id: 'e2', source_id: 'a', target_id: 'a' }),
      ],
    });

    expect(view.edges.map((item) => item.id)).toEqual(['e2']);
  });

  it('边没有 id（或 id 为空）时按序号补一个稳定 id', () => {
    const view = toGraphView({
      nodes: [node({ id: 'a' })],
      edges: [edge({ id: '' as never, source_id: 'a', target_id: 'a' })],
    });

    expect(view.edges[0].id).toBe('edge-0');
  });

  it('哈希稳定：同标签同槽位，不同标签尽量分散', () => {
    expect(hashLabel('Person')).toBe(hashLabel('Person'));
    expect(hashLabel('Person')).not.toBe(hashLabel('Chunk'));
  });
});

describe('统计', () => {
  it('按类型聚合（不是按实体名），数量降序、同数量按类型名升序', () => {
    const view = toGraphView({
      nodes: [
        node({ id: 'a', type: 'Person', name: '张三' }),
        node({ id: 'b', type: 'Person', name: '李四' }),
        node({ id: 'c', type: 'Org', name: '星海科技' }),
      ],
      edges: [
        edge({ id: 'e1', source_id: 'a', target_id: 'b', type: 'KNOWS' }),
        edge({ id: 'e2', source_id: 'a', target_id: 'c', type: 'WORKS_AT' }),
      ],
    });

    const stats = summarizeGraph(view);
    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(2);
    expect(stats.nodeTypes).toEqual([
      { label: 'Person', count: 2 },
      { label: 'Org', count: 1 },
    ]);
    // 数量相同按标签升序：KNOWS 在 WORKS_AT 前
    expect(stats.edgeTypes.map((item) => item.label)).toEqual([
      'KNOWS',
      'WORKS_AT',
    ]);
  });
});

describe('颜色 token 解析', () => {
  it('借 CSS 引擎把 token 解析成算好的色值，并恢复原来的行内颜色', () => {
    const element = document.createElement('div');
    element.style.color = 'var(--color-text-1)';
    const computed = { color: 'rgb(64, 128, 255)' } as CSSStyleDeclaration;
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue(computed);

    const colors = resolveGraphColors(element, ['--data-1', '--data-2']);

    expect(colors).toEqual({
      '--data-1': 'rgb(64, 128, 255)',
      '--data-2': 'rgb(64, 128, 255)',
    });
    // token 是通道值，必须包进 rgb(var(...)) 才是合法颜色声明
    expect(element.style.color).toBe('var(--color-text-1)');
    spy.mockRestore();
  });

  it('写进行内样式的是 rgb(var(--token))：只写 var() 会被丢掉', () => {
    const element = document.createElement('div');
    const seen: string[] = [];
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          // 每次读 color 都记下当时元素上的行内颜色
          get color() {
            seen.push(element.style.color);
            return 'rgb(48, 111, 255)';
          },
        }) as unknown as CSSStyleDeclaration,
    );

    resolveGraphColors(element, ['--data-1']);

    expect(seen).toEqual(['rgb(var(--data-1))']);
    spy.mockRestore();
  });

  it('语义色与数据类型色分开取，画布按名字使用', () => {
    const resolved: Record<string, string> = {};
    for (const token of GRAPH_COLOR_TOKENS) resolved[token] = 'rgb(1, 2, 3)';

    const palette = readPalette(resolved);

    expect(palette.nodeLabel).toBe('rgb(1, 2, 3)');
    expect(Object.keys(palette)).toHaveLength(5);
  });

  it('画布用到的 token 全部在 tokens.css 里有定义（拼错就会在这里失败）', () => {
    // 用例从 web/ 运行（vitest 的 root），直接读仓库里的 token 定义
    const css = readFileSync('src/styles/tokens.css', 'utf8');
    const missing = GRAPH_COLOR_TOKENS.filter(
      (token) => !new RegExp(`${token}:`).test(css),
    );

    expect(missing).toEqual([]);
  });
});

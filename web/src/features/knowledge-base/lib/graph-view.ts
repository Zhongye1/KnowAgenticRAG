/**
 * 图谱视图的纯逻辑：后端子图 → 画布数据、类型统计、颜色 token 选择。
 *
 * `check:tokens` 不允许源码里出现硬编码颜色，因此这里只产出 `src/styles/tokens.css` 的
 * 变量名（`--data-N` 等），
 * 由画布层经 `resolveGraphColors` 交给 CSS 引擎解析成具体色值——亮暗两套变量不同，
 * 主题联动因此成立。类型到颜色的映射按标签哈希，同一标签恒定落同一个槽位。
 */
import type { GraphEdge, GraphNode, GraphSubgraph } from '../api/graph-api';

/** 节点色：取 `--data-*` 里偏深的半边；边色取偏浅的另半边，避免节点与边同色。 */
const NODE_COLOR_TOKENS = [
  '--data-1',
  '--data-3',
  '--data-5',
  '--data-7',
  '--data-9',
  '--data-11',
  '--data-13',
  '--data-15',
  '--data-17',
  '--data-19',
] as const;

const EDGE_COLOR_TOKENS = [
  '--data-2',
  '--data-4',
  '--data-6',
  '--data-8',
  '--data-10',
  '--data-12',
  '--data-14',
  '--data-16',
  '--data-18',
  '--data-20',
] as const;

/** Chunk 节点在两种主题下都用中性灰，与实体节点区分开。 */
const CHUNK_COLOR_TOKEN = '--color-fill-3';

export type GraphNodeView = {
  id: string;
  /** 画布上显示的标签：实体名（缺名时退回类型）。 */
  label: string;
  /** 实体类型；决定配色与类型分布统计。 */
  type: string;
  /** CSS 变量名，不是色值。 */
  colorToken: string;
  degree: number;
  original: GraphNode;
};

export type GraphEdgeView = {
  id: string;
  label: string;
  type: string;
  colorToken: string;
  source: string;
  target: string;
  original: GraphEdge;
};

export type GraphView = { nodes: GraphNodeView[]; edges: GraphEdgeView[] };

/** 稳定哈希（djb2）：同一标签总是落到同一个颜色槽。 */
export const hashLabel = (label: string): number => {
  let hash = 5381;
  for (let index = 0; index < label.length; index += 1) {
    hash = ((hash << 5) + hash + label.charCodeAt(index)) >>> 0;
  }
  return hash;
};

/** 节点展示标签：类型 → 归一类型 → 属性 label → Entity。 */
export const describeNodeType = (node: GraphNode): string =>
  node.type ||
  node.normalized?.type ||
  String(node.properties?.label ?? '') ||
  'Entity';

/** 边展示标签：类型 → 归一类型 → RELATED_TO。 */
export const describeEdgeType = (edge: GraphEdge): string =>
  edge.type || edge.normalized?.type || 'RELATED_TO';

/** 节点描边宽度与半径：度数越高越大，上限 50。 */
export const nodeSizeByDegree = (degree: number): number =>
  Math.min(15 + degree * 5, 50);

/** 节点颜色 token：Chunk 固定灰，其余按类型哈希落槽。画布与图例共用这一处。 */
export const nodeTypeColorToken = (type: string): string =>
  type === 'Chunk'
    ? CHUNK_COLOR_TOKEN
    : NODE_COLOR_TOKENS[hashLabel(type) % NODE_COLOR_TOKENS.length];

/** 边颜色 token：按类型标签哈希落槽。 */
export const edgeTypeColorToken = (label: string): string =>
  EDGE_COLOR_TOKENS[hashLabel(label) % EDGE_COLOR_TOKENS.length];

/**
 * 转换子图：算度数、挑颜色 token、过滤掉端点缺失的边。
 *
 * 后端在 `exclude_chunk` 下仍可能给出指向已过滤节点的边（子图是按深度取的两跳），
 * 这类边在画布上没有端点可落，直接丢掉，避免 G6 抛「找不到 source 节点」。
 */
export const toGraphView = (subgraph: GraphSubgraph): GraphView => {
  const degrees = new Map<string, number>();
  for (const edge of subgraph.edges) {
    degrees.set(edge.source_id, (degrees.get(edge.source_id) ?? 0) + 1);
    degrees.set(edge.target_id, (degrees.get(edge.target_id) ?? 0) + 1);
  }

  const nodes = subgraph.nodes.map((node) => {
    const type = describeNodeType(node);
    return {
      id: String(node.id),
      // 画布上写的是实体名；类型只用来挑颜色与统计
      label: node.name || type,
      type,
      colorToken: nodeTypeColorToken(type),
      degree: degrees.get(String(node.id)) ?? 0,
      original: node,
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = subgraph.edges
    .filter(
      (edge) =>
        nodeIds.has(String(edge.source_id)) &&
        nodeIds.has(String(edge.target_id)),
    )
    .map((edge, index) => {
      const label = describeEdgeType(edge);
      return {
        // 空 id 会让所有这类边在 G6 里撞成同一个元素，按序号补一个
        id: String(edge.id || `edge-${index}`),
        label,
        type: label,
        colorToken: edgeTypeColorToken(label),
        source: String(edge.source_id),
        target: String(edge.target_id),
        original: edge,
      };
    });

  return { nodes, edges };
};

export type GraphTypeCount = {
  label: string;
  count: number;
  colorToken: string;
};

export type GraphViewStats = {
  nodeCount: number;
  edgeCount: number;
  nodeTypes: GraphTypeCount[];
  edgeTypes: GraphTypeCount[];
};

/** 按类型聚合计数，数量降序、同数量按类型名升序，保证展示顺序稳定。 */
const countByType = (
  items: Array<{ type: string }>,
  colorOf: (type: string) => string,
): GraphTypeCount[] => {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }
  return Array.from(counts, ([label, count]) => ({
    label,
    count,
    colorToken: colorOf(label),
  })).sort(
    (left, right) =>
      right.count - left.count || left.label.localeCompare(right.label),
  );
};

/** 实体节点：Chunk 是实现细节，不算实体。 */
export const isEntityNode = (node: GraphNode): boolean =>
  describeNodeType(node) !== 'Chunk';

/** 实体关系：MENTIONS 连的是 Chunk，同样不进图例。 */
export const isEntityRelationEdge = (edge: GraphEdge): boolean =>
  describeEdgeType(edge) !== 'MENTIONS';

/**
 * 画布图例与计数（全部来自当前这份子图，不再请求后端）。
 *
 * Chunk 节点与 MENTIONS 边不计入：图例只谈实体与实体间的关系。带 `exclude_chunk=false`
 * 取到整图时，这里的数字才与用户的直觉一致。
 */
export const summarizeGraph = (view: GraphView): GraphViewStats => {
  const nodes = view.nodes.filter((node) => isEntityNode(node.original));
  const edges = view.edges.filter((edge) =>
    isEntityRelationEdge(edge.original),
  );
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypes: countByType(nodes, nodeTypeColorToken),
    edgeTypes: countByType(edges, edgeTypeColorToken),
  };
};

/** 画布固定要用的语义色：标签、标签底色、节点描边、阴影、画布底色。 */
export const GRAPH_PALETTE_TOKENS = {
  nodeLabel: '--color-text-1',
  edgeLabel: '--color-text-2',
  labelBackground: '--color-fill-2',
  nodeStroke: '--color-bg-1',
  shadow: '--color-border-3',
} as const;

export type GraphPalette = Record<keyof typeof GRAPH_PALETTE_TOKENS, string>;

/**
 * 把 token 解析成 canvas 认识的色值。
 *
 * `tokens.css` 里的颜色是通道值（`--data-1: 64 128 255`），自定义属性取回来是那三个数字，
 * canvas 不认；只写 `var(--token)` 也不是合法颜色（会整条声明被丢掉，退回继承来的文字色）。
 * 因此这里借一个真实颜色属性把 token 包进 `rgb(var(--token))`，让 CSS 引擎算出具体色值再读回——
 * 这也是 `check:tokens` 明确放行的 Token 引用写法。解析在同一个元素上连续进行，
 * 结束后恢复原来的行内颜色；主题切换后重新调用即可拿到新一套色值。
 */
export const resolveGraphColors = (
  element: HTMLElement,
  tokens: readonly string[] = GRAPH_COLOR_TOKENS,
): Record<string, string> => {
  const computed = getComputedStyle(element);
  const previous = element.style.color;
  const colors: Record<string, string> = {};
  for (const token of tokens) {
    element.style.color = `rgb(var(${token}))`;
    colors[token] = computed.color;
  }
  element.style.color = previous;
  return colors;
};

/** 从解析结果里取出画布要用的那几个语义色。 */
export const readPalette = (colors: Record<string, string>): GraphPalette => ({
  nodeLabel: colors[GRAPH_PALETTE_TOKENS.nodeLabel],
  edgeLabel: colors[GRAPH_PALETTE_TOKENS.edgeLabel],
  labelBackground: colors[GRAPH_PALETTE_TOKENS.labelBackground],
  nodeStroke: colors[GRAPH_PALETTE_TOKENS.nodeStroke],
  shadow: colors[GRAPH_PALETTE_TOKENS.shadow],
});

/** 画布会用到的全部颜色 token（解析与预热共用一份）。 */
export const GRAPH_COLOR_TOKENS = Array.from(
  new Set([
    ...NODE_COLOR_TOKENS,
    ...EDGE_COLOR_TOKENS,
    CHUNK_COLOR_TOKEN,
    ...Object.values(GRAPH_PALETTE_TOKENS),
  ]),
);

/**
 * 图谱画布：`@antv/g6` v5 的 React 封装。
 *
 * 与上游 `GraphCanvas.vue` 的差异（有意为之）：
 * 1) 上游一次加载会同时走「deep watch → setData」与「refreshGraph → 销毁重建」两条路径，
 *    同一份数据被渲染两次；这里收敛成一条：数据变更只 `setData`，重建只服务主题切换、
 *    容器尺寸变化与手动刷新。
 * 2) 上游在容器 0×0 时靠 5×200 ms 轮询重试初始化、并监听 `window.resize` 全量重建；
 *    这里由 ResizeObserver 驱动（首帧、尺寸变化都覆盖），不再监听 window。
 * 3) 上游把 `highlighted`/`hidden`/`focus` 当 G6 状态用，但 5.1.1 的内建主题没有这三个
 *    状态样式，属静默空操作；本仓不提供这套假 API，选中态交给 `click-select` 行为。
 * 4) 颜色不写死：`resolveGraphColors` 让 CSS 引擎把 `tokens.css` 的变量算成色值；
 *    G6 在创建时快照样式，因此主题切换时重建实例。
 */
import * as React from 'react';
import { Graph } from '@antv/g6';

import type { GraphEdge, GraphNode } from '../api/graph-api';
import {
  nodeSizeByDegree,
  readPalette,
  resolveGraphColors,
  type GraphView,
} from '../lib/graph-view';
import { useIsDarkMode } from '@/shared/lib/theme';

/**
 * 从 G6 的元素事件里取被点的元素 id。
 *
 * `on()` 的回调类型是 `IEvent` 联合（含生命周期事件），只有元素事件带 `target`，
 * 因此这里按运行时形状取，拿不到就不是元素点击。
 */
const eventTargetId = (event: unknown): string | undefined => {
  const target = (event as { target?: { id?: unknown } } | null)?.target;
  return typeof target?.id === 'string' ? target.id : undefined;
};

/** 数据签名：节点/边的 id 与端点决定画布内容，内容没变就不重画。 */
const signatureOf = (view: GraphView): string =>
  [
    view.nodes.length,
    view.edges.length,
    // 标签与度数也进签名：同 id 但名称/类型变了同样要重画
    view.nodes
      .map(
        (node) => `${node.id}:${node.label}:${node.colorToken}:${node.degree}`,
      )
      .join(','),
    view.edges
      .map((edge) => `${edge.id}:${edge.source}>${edge.target}:${edge.label}`)
      .join(','),
  ].join('|');

export type GraphCanvasProps = {
  view: GraphView;
  onNodeClick: (node: GraphNode) => void;
  onEdgeClick: (edge: GraphEdge) => void;
  /** 点空白处：关闭详情面板。 */
  onCanvasClick: () => void;
  /** 每次数据真正画完之后通知调用方（对应上游的 `data-rendered`）。 */
  onDataRendered?: () => void;
};

/**
 * 力导布局参数：取上游 `GraphCanvas.vue` 的数值，但按 G6 v5 的键名摊平。
 *
 * 上游把它们写在 `force: { center, charge, link, collide }` 里，G6 5.1.1 不认识这个键
 * （合法键是 `link`/`manyBody`/`collide`/`center`），等于整套间距配置没生效、用默认值渲染，
 * 节点会挤成一团。这里给同一组数值配上正确键名：`charge` → `manyBody`。
 */
const LAYOUT = {
  type: 'd3-force',
  alphaDecay: 0.1,
  alphaMin: 0.01,
  velocityDecay: 0.6,
  iterations: 150,
  center: { x: 0.5, y: 0.5, strength: 0.1 },
  manyBody: { strength: -400, distanceMax: 600 },
  link: { distance: 100, strength: 0.8 },
  collide: { radius: 40, strength: 0.8, iterations: 3 },
};

export const GraphCanvas = ({
  view,
  onNodeClick,
  onEdgeClick,
  onCanvasClick,
  onDataRendered,
}: GraphCanvasProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const graphRef = React.useRef<Graph | null>(null);
  /** 当前主题下 token → 色值；重建实例时刷新。 */
  const colorsRef = React.useRef<Record<string, string>>({});
  /**
   * 已经画上去的那份数据的签名：数据内容没变就不重画。
   * 只比对象引用不够——父组件每次渲染都可能造一个新对象，而力导布局重画的代价很高。
   */
  const appliedRef = React.useRef<string | null>(null);
  /** 最近一次 `render()` 的 promise：销毁要等它落定，否则 G6 会在销毁后继续跑渲染管线。 */
  const renderRef = React.useRef<Promise<unknown> | null>(null);
  const isDark = useIsDarkMode();

  // G6 的事件处理器只注册一次，因此回调与数据放进 ref，避免捕获过期 props；
  // 赋值放在 effect 里（渲染期写 ref 会被 react(refs) 规则拦下，且并发渲染下不安全）
  const handlersRef = React.useRef({
    onNodeClick,
    onEdgeClick,
    onCanvasClick,
    onDataRendered,
  });
  const viewRef = React.useRef(view);
  React.useEffect(() => {
    handlersRef.current = {
      onNodeClick,
      onEdgeClick,
      onCanvasClick,
      onDataRendered,
    };
    viewRef.current = view;
  });

  /**
   * 视口收尾：内容超出视口才缩放，随后居中。
   *
   * 上游从不在画完后自适应，小图会被放大到节点与文字糊在一起；这里用 `when: 'overflow'`
   * 只在真的放不下时缩，避免两个极端。
   */
  const settleViewport = React.useCallback((instance: Graph) => {
    // 调用点（paint 回调与 ResizeObserver）都已确认实例仍是当前那个，这里不再重复校验
    void instance
      .fitView({ when: 'overflow' })
      .then(() => instance.fitCenter());
  }, []);

  /** 只换数据，不重建；G6 的 render 返回 Promise，这里明确不 await（画布自己重绘）。 */
  const paint = React.useCallback((instance: Graph, next: GraphView) => {
    instance.setData({
      nodes: next.nodes.map((node) => ({
        id: node.id,
        data: {
          label: node.label,
          colorToken: node.colorToken,
          degree: node.degree,
        },
      })),
      edges: next.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        data: { label: edge.label, colorToken: edge.colorToken },
      })),
    });
    appliedRef.current = signatureOf(next);
    renderRef.current = instance.render();
    void renderRef.current.then(() => {
      // 主题切换 / 卸载会销毁旧实例，销毁后不再碰它（否则 G6 会报已销毁实例或空 context）
      if (graphRef.current !== instance) return;
      settleViewport(instance);
      handlersRef.current.onDataRendered?.();
    });
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let instance: Graph | null = null;
    let observer: ResizeObserver | null = null;

    const colorOf = (token?: string, fallback = ''): string =>
      (token && colorsRef.current[token]) || fallback;

    const create = (): boolean => {
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return false;

      colorsRef.current = resolveGraphColors(container);
      const palette = readPalette(colorsRef.current);
      instance = new Graph({
        container,
        width,
        height,
        layout: LAYOUT,
        theme: isDark ? 'dark' : 'light',
        node: {
          type: 'circle',
          style: {
            opacity: 0.9,
            lineWidth: 1.5,
            shadowColor: palette.shadow,
            shadowBlur: 4,
            labelWordWrap: true,
            labelMaxWidth: '300%',
            labelFill: palette.nodeLabel,
            stroke: palette.nodeStroke,
            labelText: (datum: { data?: { label?: string } }) =>
              datum.data?.label ?? '',
            size: (datum: { data?: { degree?: number } }) =>
              nodeSizeByDegree(datum.data?.degree ?? 0),
            fill: (datum: { data?: { colorToken?: string } }) =>
              colorOf(datum.data?.colorToken, palette.nodeStroke),
          },
        },
        edge: {
          type: 'quadratic',
          style: {
            opacity: 0.8,
            lineWidth: 1.2,
            endArrow: true,
            labelBackground: true,
            labelFill: palette.edgeLabel,
            labelBackgroundFill: palette.labelBackground,
            labelText: (datum: { data?: { label?: string } }) =>
              datum.data?.label ?? '',
            stroke: (datum: { data?: { colorToken?: string } }) =>
              colorOf(datum.data?.colorToken, palette.edgeLabel),
          },
        },
        behaviors: [
          'drag-element',
          'zoom-canvas',
          'drag-canvas',
          'hover-activate',
          // 与上游同一套：可多选、shift 触发、相邻标 active、其余标 inactive
          {
            type: 'click-select',
            multiple: true,
            degree: 1,
            trigger: ['shift'],
            state: 'selected',
            neighborState: 'active',
            unselectedState: 'inactive',
          },
        ],
      });
      graphRef.current = instance;

      // 事件参数交给 G6 的类型推断，不手写结构（手写会与 IElementEvent 不兼容）
      instance.on('node:click', (event) => {
        const id = eventTargetId(event);
        const datum = id
          ? viewRef.current.nodes.find((node) => node.id === id)
          : undefined;
        if (datum) handlersRef.current.onNodeClick(datum.original);
      });
      instance.on('edge:click', (event) => {
        const id = eventTargetId(event);
        const datum = id
          ? viewRef.current.edges.find((edge) => edge.id === id)
          : undefined;
        if (datum) handlersRef.current.onEdgeClick(datum.original);
      });
      instance.on('canvas:click', () => handlersRef.current.onCanvasClick());

      paint(instance, viewRef.current);

      observer = new ResizeObserver(() => {
        if (!instance || graphRef.current !== instance) return;
        const box = container.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return;
        instance.setSize(box.width, box.height);
        settleViewport(instance);
      });
      observer.observe(container);
      return true;
    };

    if (!create()) {
      // 容器还没有尺寸（分区刚切过来、布局未完成）：等 ResizeObserver 的第一帧
      const pending = new ResizeObserver(() => {
        if (create()) pending.disconnect();
      });
      pending.observe(container);
      return () => pending.disconnect();
    }

    return () => {
      observer?.disconnect();
      appliedRef.current = null;
      graphRef.current = null;
      // 销毁要等首帧渲染落定：G6 5.1.1 的渲染/布局管线在销毁后继续跑会碰空 context
      // （开发模式下 effect 双调用必然踩到）。不调 stopLayout——没有布局在跑时它会抛错。
      const current = instance;
      const pending = renderRef.current;
      const finish = () => {
        current?.destroy();
      };
      if (pending) void pending.then(finish, finish);
      else finish();
      instance = null;
    };
  }, [isDark, paint, settleViewport]);

  // 数据变更只更新数据；主题切换由上面的 effect 重建
  React.useEffect(() => {
    const instance = graphRef.current;
    if (!instance || appliedRef.current === signatureOf(view)) return;
    paint(instance, view);
  }, [view, paint]);

  return (
    // 力导图本身对读屏不可达，因此把「画布描述」作为真实文本交给辅助技术，
    // 容器只当 G6 的挂载点，不冒充图片元素。
    <div className="h-[520px] w-full overflow-hidden rounded-large border border-color-border-1 bg-color-bg-1">
      <p className="sr-only">
        {`知识图谱画布：${view.nodes.length} 个节点、${view.edges.length} 条关系。`}
        可拖拽移动、滚轮缩放，点击节点或关系查看详情。
      </p>
      <div
        ref={containerRef}
        data-testid="graph-canvas"
        className="h-full w-full"
      />
    </div>
  );
};

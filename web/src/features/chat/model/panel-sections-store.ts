/**
 * 右侧面板的分区状态层。
 *
 * 分区列表、激活键、开关、最大化、拖宽与子智能体分区的自动同步都在这里；页面只消费
 * 这个 hook 返回的状态与动作，不再各自持有一份 useState。分区的增改纯逻辑在
 * `lib/panel-sections.ts`，宽度换算在 `lib/panel-width.ts`，本文件是它们的组合所有者。
 */
import * as React from 'react';

import {
  FILE_TREE_SECTION,
  MESSAGE_DEBUG_SECTION,
  STATE_SECTION,
  closeSection,
  normalizeSections,
  upsertSection,
  type PanelSection,
} from '../lib/panel-sections';
import {
  DEFAULT_PANEL_RATIO,
  panelRatioFromWidth,
  panelWidthFromRatio,
  resizePanelWidth,
} from '../lib/panel-width';
import { readSubagentRuns, subagentRunTitle } from '../lib/subagent-run';
import type { SubagentRun } from '../lib/subagent-run';

/** 由一条子智能体运行态生成对应的分区；无子线程 id 时返回 null。 */
export const subagentRunSection = (run: SubagentRun): PanelSection | null => {
  if (!run.child_thread_id) return null;
  return {
    key: `subagent:${run.run_id ?? run.child_thread_id}`,
    type: 'subagent',
    title: subagentRunTitle(run),
    threadId: run.child_thread_id,
    runId: run.run_id,
    runStatus: run.status,
  };
};

export type AgentPanelSections = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** 打开（或激活到）一个分区；分区不存在时追加。 */
  openSection: (section: PanelSection) => void;
  sections: PanelSection[];
  activeSectionKey: string;
  setActiveSectionKey: (key: string) => void;
  maximized: boolean;
  toggleMaximize: () => void;
  width: number | string;
  /** 拖拽中的指针横坐标；内部按容器宽度换算并夹紧边界。 */
  onResize: (clientX: number) => void;
  /** 拖拽结束：把拖拽期的像素宽回写成持久比例。 */
  endResize: () => void;
  /** 拖拽是否进行中；外壳用它冻结过渡。 */
  resizing: boolean;
  /** 面板行的容器 ref；拖宽换算要用它的实际宽度。 */
  rowRef: React.RefObject<HTMLDivElement | null>;
  /** 关闭一个分区；返回新的分区列表与激活键。 */
  closeSection: (key: string) => { sections: PanelSection[]; activeKey: string };
  /** 点击调试入口 / 用量环：未开面板时先带上调试分区，再翻转开关。 */
  toggleWithDebugSection: () => void;
  /**
   * 子智能体分区随 `agent_state.subagent_runs` 同步：有运行态就有分区，
   * 运行态消失（清空）时只清掉 subagent 分区，不动文件与调试分区。
   */
  syncSubagentRuns: (agentState: unknown) => void;
};

export const useAgentPanelSections = (): AgentPanelSections => {
  const [open, setOpen] = React.useState(false);
  const [sections, setSections] = React.useState<PanelSection[]>(() => [
    FILE_TREE_SECTION,
    STATE_SECTION,
    MESSAGE_DEBUG_SECTION,
  ]);
  const [activeSectionKey, setActiveSectionKey] = React.useState(
    FILE_TREE_SECTION.key,
  );
  const [maximized, setMaximized] = React.useState(false);
  // 持久宽度是容器比例（参照 panelRatio），拖拽期间临时落成像素
  const [panelRatio, setPanelRatio] = React.useState(DEFAULT_PANEL_RATIO);
  const [dragWidth, setDragWidth] = React.useState<number | null>(null);
  // 内容行实际宽度；ResizeObserver 同步，展示换算用
  const [containerWidth, setContainerWidth] = React.useState(0);
  // 拖拽锚点：`resizePanelWidth` 会在碰到边界时把它们换成新的
  const resizeRef = React.useRef({ startX: 0, startWidth: 0 });
  const rowRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(() => {
      setContainerWidth(row.clientWidth);
    });
    observer.observe(row);
    setContainerWidth(row.clientWidth);
    return () => observer.disconnect();
  }, []);

  const width: number | string = maximized
    ? '100%'
    : dragWidth !== null
      ? dragWidth
      : panelWidthFromRatio(panelRatio, containerWidth);

  const openSection = React.useCallback((section: PanelSection) => {
    setSections((current) => upsertSection(normalizeSections(current), section));
    setActiveSectionKey(section.key);
  }, []);

  const closeSectionByKey = React.useCallback(
    (key: string) => {
      const next = closeSection(sections, activeSectionKey, key);
      setSections(next.sections);
      setActiveSectionKey(next.activeKey);
      return next;
    },
    [sections, activeSectionKey],
  );

  const toggleWithDebugSection = React.useCallback(() => {
    setOpen((current) => {
      if (!current) {
        setSections((existing) =>
          upsertSection(normalizeSections(existing), MESSAGE_DEBUG_SECTION),
        );
        setActiveSectionKey(MESSAGE_DEBUG_SECTION.key);
      }
      return !current;
    });
  }, []);

  const onResize = React.useCallback((clientX: number) => {
    const container = rowRef.current?.clientWidth ?? 0;
    // 拖拽锚点第一次移动时从当前实际宽度起算（参照 handleResizingChange 的起始锚定）
    const anchor =
      resizeRef.current.startWidth === 0
        ? { startX: clientX, startWidth: rowRef.current?.offsetWidth ?? 0 }
        : resizeRef.current;
    const next = resizePanelWidth({
      clientX,
      startX: anchor.startX,
      startWidth: anchor.startWidth,
      containerWidth: container,
    });
    resizeRef.current = { startX: next.startX, startWidth: next.startWidth };
    setDragWidth(next.width);
  }, []);

  /** 拖拽结束：最终像素回写成持久比例，锚点清零（参照 handleResizingChange 收尾）。 */
  const endResize = React.useCallback(() => {
    setPanelRatio((current) => {
      const container = rowRef.current?.clientWidth ?? 0;
      if (!container || dragWidth === null) return current;
      return panelRatioFromWidth(dragWidth, container);
    });
    setDragWidth(null);
    resizeRef.current = { startX: 0, startWidth: 0 };
  }, [dragWidth]);

  const syncSubagentRuns = React.useCallback((agentState: unknown) => {
    const runs = readSubagentRuns(agentState);
    setSections((current) => {
      const others = current.filter((section) => section.type !== 'subagent');
      if (runs.length === 0) {
        return others.length === current.length ? current : others;
      }
      const merged = [...others];
      for (const run of runs) {
        const section = subagentRunSection(run);
        if (section) merged.push(section);
      }
      return merged;
    });
  }, []);

  return {
    open,
    setOpen,
    openSection,
    sections,
    activeSectionKey,
    setActiveSectionKey,
    maximized,
    toggleMaximize: () => setMaximized((current) => !current),
    width,
    onResize,
    endResize,
    resizing: dragWidth !== null,
    rowRef,
    closeSection: closeSectionByKey,
    toggleWithDebugSection,
    syncSubagentRuns,
  };
};

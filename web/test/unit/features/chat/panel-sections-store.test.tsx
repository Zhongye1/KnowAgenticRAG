import { act, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useAgentPanelSections,
  type AgentPanelSections,
} from '@/features/chat/model/panel-sections-store';

/** 内容行宽度；jsdom 里量不到布局，这里直接钉死。 */
const ROW_WIDTH = 1200;

const stubWidths = (width: number) => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width);
};

/**
 * 探针：把 hook 的 `rowRef` 挂到真实节点上。
 *
 * 不挂的话 hook 里的 ResizeObserver 量不到宽度，`width` 会退回百分比兜底，
 * 拖拽锚点也就无从验证。
 */
const renderPanel = () => {
  let api!: AgentPanelSections;
  const Probe = () => {
    api = useAgentPanelSections();

    return <div ref={api.rowRef} />;
  };
  render(<Probe />);

  return () => api;
};

describe('useAgentPanelSections 的拖拽锚点', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('第一次移动按面板当前宽度起算，不跳到最大宽度', () => {
    stubWidths(ROW_WIDTH);
    const panel = renderPanel();

    // 拖拽前 width 是 CSS 值（`600px`），拖拽期是数字；统一按像素比
    const widthPx = () => Number.parseFloat(String(panel().width));

    // 默认比例 0.5 → 面板 600px
    expect(widthPx()).toBe(600);

    // 第一次移动只落锚点，宽度不变：
    // 拿内容行宽度（1200）当锚点会在这里直接顶到最大宽度 900
    act(() => panel().onResize(500));
    expect(widthPx()).toBe(600);

    // 再往左拖 100px → 700
    act(() => panel().onResize(400));
    expect(widthPx()).toBe(700);
  });

  it('量不到宽度时不改宽度', () => {
    stubWidths(0);
    const panel = renderPanel();
    const before = panel().width;

    act(() => panel().onResize(500));

    expect(panel().width).toBe(before);
  });

  it('收尾回写最后一次拖拽宽度，松手后不再自己挪一步', () => {
    stubWidths(ROW_WIDTH);
    const panel = renderPanel();

    // 同一批里连拖两下再收尾（拖拽期每帧一次 onResize 的极端情形）：
    // 收尾读 state 会拿到上一帧的宽度，比例回写成 600，松手后面板自己弹回去
    act(() => {
      panel().onResize(500);
      panel().onResize(400);
      panel().endResize();
    });

    expect(Number.parseFloat(String(panel().width))).toBe(700);
  });
});

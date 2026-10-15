import { describe, expect, it } from 'vitest';

import {
  clampPanelRatio,
  clampPanelWidth,
  MOBILE_PANEL_BREAKPOINT,
  panelMaxWidth,
  panelMinWidth,
  panelRatioFromWidth,
  panelWidthFromRatio,
  resizePanelWidth,
} from '@/features/chat/lib/panel-width';

describe('panelMaxWidth', () => {
  it('桌面端给主对话区留出最小宽度', () => {
    expect(panelMaxWidth(1600)).toBe(1250);
  });

  it('移动端只留一点边距', () => {
    expect(panelMaxWidth(700)).toBe(684);
  });

  it('容器宽度为 0 或负时上界为 0', () => {
    expect(panelMaxWidth(0)).toBe(0);
    expect(panelMaxWidth(-10)).toBe(0);
  });

  it('窄容器按移动端分支，不返回负数', () => {
    expect(panelMaxWidth(400)).toBe(384);
    expect(panelMaxWidth(16)).toBe(0);
    expect(panelMaxWidth(10)).toBe(0);
  });
});

describe('panelMinWidth', () => {
  it('桌面端 320、移动端 280', () => {
    expect(panelMinWidth(1600)).toBe(320);
    expect(panelMinWidth(700)).toBe(280);
  });

  it('上界比下界还小时取上界，避免下界大于上界', () => {
    expect(panelMinWidth(1600, 0)).toBe(0);
    expect(panelMinWidth(1600, 50)).toBe(50);
  });

  it('断点本身按移动端处理', () => {
    expect(panelMinWidth(MOBILE_PANEL_BREAKPOINT)).toBe(280);
  });
});

describe('clampPanelWidth', () => {
  it('夹到上下界之间', () => {
    expect(clampPanelWidth(500, 1600)).toBe(500);
    expect(clampPanelWidth(100, 1600)).toBe(320);
    expect(clampPanelWidth(9999, 1600)).toBe(1250);
  });
});

describe('resizePanelWidth', () => {
  it('往左拖变宽', () => {
    const result = resizePanelWidth({
      clientX: 900,
      startX: 1000,
      startWidth: 500,
      containerWidth: 1600,
    });

    expect(result.width).toBe(600);
    expect(result.reanchored).toBe(false);
  });

  it('往右拖变窄', () => {
    const result = resizePanelWidth({
      clientX: 1100,
      startX: 1000,
      startWidth: 500,
      containerWidth: 1600,
    });

    expect(result.width).toBe(400);
  });

  it('碰到上界时重新锚定，继续拖能立刻响应', () => {
    const result = resizePanelWidth({
      clientX: 0,
      startX: 1000,
      startWidth: 500,
      containerWidth: 1600,
    });

    expect(result.width).toBe(1250);
    expect(result.reanchored).toBe(true);
    expect(result.startX).toBe(0);
    expect(result.startWidth).toBe(1250);

    // 从新锚点继续往右拖，宽度立刻变小，而不是先抵消多拖出去的距离
    const next = resizePanelWidth({
      clientX: 50,
      startX: result.startX,
      startWidth: result.startWidth,
      containerWidth: 1600,
    });
    expect(next.width).toBe(1200);
  });

  it('碰到下界时也重新锚定', () => {
    const result = resizePanelWidth({
      clientX: 5000,
      startX: 1000,
      startWidth: 500,
      containerWidth: 1600,
    });

    expect(result.width).toBe(320);
    expect(result.reanchored).toBe(true);
  });

  it('没碰到边界时不重新锚定', () => {
    const result = resizePanelWidth({
      clientX: 950,
      startX: 1000,
      startWidth: 500,
      containerWidth: 1600,
    });

    expect(result.reanchored).toBe(false);
    expect(result.startX).toBe(1000);
    expect(result.startWidth).toBe(500);
  });
});

describe('panelWidthFromRatio / panelRatioFromWidth（参照 panelRatio 模型）', () => {
  it('默认 50% 比例在窄容器里被最小宽度兜住', () => {
    // 400px 容器按移动端分支（≤768），50% 是 200px，低于移动端最小宽 280px，落到 280px
    expect(panelWidthFromRatio(0.5, 400)).toBe('280px');
    // 800px 容器按桌面分支，50% 是 400px，高于 320px，直接取比例值
    expect(panelWidthFromRatio(0.5, 800)).toBe('400px');
  });

  it('75% 比例超过像素上界时按上界取', () => {
    // 1600px 容器上界是 1250px；75% 是 1200px，未触界
    expect(panelWidthFromRatio(0.75, 1600)).toBe('1200px');
    // 1300px 容器：75% = 975px，但上界是 1300-350 = 950px，落到 950px
    expect(panelWidthFromRatio(0.75, 1300)).toBe('950px');
  });

  it('容器没有宽度时退回百分比字符串', () => {
    expect(panelWidthFromRatio(0.5, 0)).toBe('50%');
  });

  it('比例被夹在 25%–75%，窄容器按像素上界再收', () => {
    expect(clampPanelRatio(0.1, 1600)).toBe(0.25);
    expect(clampPanelRatio(0.9, 1600)).toBe(0.75);
    // 1300px 容器像素上界 950/1300 ≈ 0.73，比 0.75 更紧
    expect(clampPanelRatio(0.9, 1300)).toBeCloseTo(950 / 1300);
  });

  it('拖拽结束把像素宽回写成比例', () => {
    expect(panelRatioFromWidth(800, 1600)).toBe(0.5);
    // 低于 25% 落回下界
    expect(panelRatioFromWidth(100, 1600)).toBe(0.25);
    // 1600 容器的像素上界 1250/1600 ≈ 0.78 高于 0.75，比例上界生效，仍夹到 0.75
    expect(panelRatioFromWidth(1600, 1600)).toBe(0.75);
  });

  it('容器没有宽度时回写保持默认比例', () => {
    expect(panelRatioFromWidth(600, 0)).toBe(0.5);
  });
});

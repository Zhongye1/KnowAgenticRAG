/**
 * 右侧面板的宽度约束与拖拽换算。
 *
 * 面板从右侧往左拖会变宽，因此宽度是「起始宽度 − 水平位移」。宽度有上下界：下界保证
 * 面板本身可用，上界保证左边的主对话区不被挤没。
 *
 * 拖到边界时会把**拖拽起点重新锚定到当前宽度**，这样用户继续往回拖能立刻响应，而不是
 * 先「抵消」掉多拖出去的那段距离。
 */

/** 容器宽度小于它时按移动端处理：上界只留一点边距。 */
export const MOBILE_PANEL_BREAKPOINT = 768;

/** 桌面端要给主对话区留的最小宽度。 */
export const MIN_CHAT_MAIN_WIDTH = 350;

/** 面板与主对话区之间的间距。 */
export const PANEL_GAP_WIDTH = 0;

/** 移动端与桌面端各自偏好的最小宽度。 */
export const MOBILE_PANEL_MIN_WIDTH = 280;
export const DESKTOP_PANEL_MIN_WIDTH = 320;

/** 面板宽度是容器宽度的比例：默认 0.5，夹在 0.25–0.75。 */
export const DEFAULT_PANEL_RATIO = 0.5;
export const MIN_PANEL_RATIO = 0.25;
export const MAX_PANEL_RATIO = 0.75;

/** 比例上界：75% 与「上界像素 / 容器宽」取小，再不低于 25%。 */
export function maxPanelRatio(containerWidth: number): number {
  if (!containerWidth) return MAX_PANEL_RATIO;
  const byPixels = panelMaxWidth(containerWidth) / containerWidth;
  return Math.max(MIN_PANEL_RATIO, Math.min(MAX_PANEL_RATIO, byPixels));
}

/** 把比例夹到 `[25%, maxPanelRatio]`。 */
export function clampPanelRatio(ratio: number, containerWidth: number): number {
  return Math.max(
    MIN_PANEL_RATIO,
    Math.min(ratio, maxPanelRatio(containerWidth)),
  );
}

/** 比例换算成展示宽度。 */
export function panelWidthFromRatio(
  ratio: number,
  containerWidth: number,
): string {
  if (!containerWidth) return `${ratio * 100}%`;

  const maxWidth = panelMaxWidth(containerWidth);
  const minWidth = panelMinWidth(containerWidth, maxWidth);
  const preferred = containerWidth * ratio;
  return `${Math.max(minWidth, Math.min(preferred, maxWidth))}px`;
}

/**
 * 与 `panelWidthFromRatio` 同一套换算的像素值。
 *
 * 拖拽锚点要的是数字，而 `panelWidthFromRatio` 的契约是 CSS 值（量不到容器宽度时退回
 * 百分比字符串）。这里在产出方把像素解析出来，调用方不必自己认字符串格式。
 */
export function panelWidthPxFromRatio(
  ratio: number,
  containerWidth: number,
): number {
  const width = panelWidthFromRatio(ratio, containerWidth);
  const match = /^([\d.]+)px$/.exec(width);

  return match ? Number(match[1]) : 0;
}

export type PanelWidthInput = {
  /** 当前指针横坐标。 */
  clientX: number;
  /** 本次拖拽的锚点横坐标。 */
  startX: number;
  /** 锚点对应的宽度。 */
  startWidth: number;
  /** 容器可用宽度。 */
  containerWidth: number;
};

export type PanelWidthResult = {
  width: number;
  /** 是否因为碰到边界而重新锚定。 */
  reanchored: boolean;
  startX: number;
  startWidth: number;
};

/** 面板宽度上界：给主对话区留够位置。 */
export function panelMaxWidth(containerWidth: number): number {
  if (containerWidth <= 0) return 0;
  if (containerWidth <= MOBILE_PANEL_BREAKPOINT) {
    return Math.max(0, containerWidth - 16);
  }

  return Math.max(0, containerWidth - MIN_CHAT_MAIN_WIDTH - PANEL_GAP_WIDTH);
}

/** 面板宽度下界：不超过上界，否则窄容器里下界会大于上界。 */
export function panelMinWidth(
  containerWidth: number,
  maxWidth = panelMaxWidth(containerWidth),
): number {
  const preferred =
    containerWidth <= MOBILE_PANEL_BREAKPOINT
      ? MOBILE_PANEL_MIN_WIDTH
      : DESKTOP_PANEL_MIN_WIDTH;

  return Math.min(preferred, maxWidth);
}

/** 把宽度夹到 `[下界, 上界]`。 */
export function clampPanelWidth(width: number, containerWidth: number): number {
  const max = panelMaxWidth(containerWidth);
  const min = panelMinWidth(containerWidth, max);

  return Math.max(min, Math.min(width, max));
}

/** 拖拽结束把最终像素宽回写成持久比例。 */
export function panelRatioFromWidth(
  finalWidth: number,
  containerWidth: number,
): number {
  if (!containerWidth) return DEFAULT_PANEL_RATIO;
  return clampPanelRatio(finalWidth / containerWidth, containerWidth);
}

/**
 * 一次拖拽移动后的宽度与新的锚点。
 *
 * 只有当夹取真的改变了宽度时才重新锚定——没碰到边界就重新锚定会让拖拽变涩。
 */
export function resizePanelWidth(input: PanelWidthInput): PanelWidthResult {
  const { clientX, startX, startWidth, containerWidth } = input;
  const rawWidth = startWidth - (clientX - startX);
  const width = clampPanelWidth(rawWidth, containerWidth);
  const reanchored = width !== rawWidth;

  return {
    width,
    reanchored,
    startX: reanchored ? clientX : startX,
    startWidth: reanchored ? width : startWidth,
  };
}

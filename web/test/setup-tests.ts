import '@testing-library/jest-dom/vitest';

/**
 * jsdom 没有实现 matchMedia，而侧边栏的 `useIsMobile` 依赖它。
 * 这里给出最小实现，避免任何触达侧边栏的用例直接崩在环境上。
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/**
 * jsdom 也没有实现 ResizeObserver，而侧边栏的 `SidebarMenuButton` 带 tooltip 时会挂
 * Radix Tooltip（内部用 react-popper 测量尺寸）。缺了它，一次点击就会抛错并卸载整棵树。
 */
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    ResizeObserverStub;
}

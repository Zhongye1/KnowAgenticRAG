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

/**
 * jsdom 也没有实现指针捕获与滚动 API，而 Radix 的 Select 在 pointerdown 时会调用它们；
 * 缺了这几项，下拉框在测试里点不开（组件本身没有问题）。
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

/**
 * jsdom 也没有实现 `Blob.prototype.text()` / `arrayBuffer()`，而上传前的文件内容校验
 * （评估基准 JSONL）与二进制预览都要用它们。用 FileReader 补上最小实现。
 */
if (!Blob.prototype.text) {
  Blob.prototype.text = function text(this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

/**
 * jsdom 没有实现 canvas 2D 上下文（返回 null 并在控制台报 “Not implemented”），而首页
 * 的 logo 粒子画布在挂载时就要清屏与逐帧绘制。这里给出最小 2D 上下文桩：图片加载在
 * jsdom 里不会发生，采样拿不到像素，动画不会真的跑起来，桩只需让初始化不抛错。
 */
const canvasContextStub = {
  clearRect: () => undefined,
  fillRect: () => undefined,
  drawImage: () => undefined,
  getImageData: () => ({ data: new Uint8ClampedArray(0) }),
  fillStyle: '',
  globalAlpha: 1,
};
HTMLCanvasElement.prototype.getContext = (() =>
  canvasContextStub) as unknown as HTMLCanvasElement['getContext'];

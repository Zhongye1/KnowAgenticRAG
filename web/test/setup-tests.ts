import '@testing-library/jest-dom/vitest';

/**
 * jsdom 没有实现 matchMedia，而日夜切换控件与首页的动效降级要读
 * `prefers-reduced-motion`、`pointer` 与断点。这里给出最小实现。
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
 * jsdom 也没有实现 ResizeObserver，而知识库图谱画布与数据总览图表都靠它拿容器尺寸。
 * 缺了它，这些组件在挂载时就会抛错。
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

/**
 * jsdom 没有实现 Element.prototype.scrollTo，对话页的滚动控制器（ScrollController）
 * 在断言之外也会对容器调它，产生成片的 unhandled rejection。滚动在 jsdom 里没有
 * 布局语义，桩成 no-op 即可；需要断言滚动的用例自己替换或监听。
 */
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = (() => undefined) as Element['scrollTo'];
}

/**
 * jsdom 的 getComputedStyle 只实现了单参形式；antd（rc-util 测滚动条尺寸）会传
 * 伪元素第二个参数，jsdom 直接 console.error 并抛 unhandled。伪元素样式在 jsdom 里
 * 无从计算，返回空声明即可。
 */
const nativeGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((elt: Element, pseudoElt?: string | null) => {
  if (pseudoElt) {
    return { getPropertyValue: () => '' } as unknown as CSSStyleDeclaration;
  }
  return nativeGetComputedStyle(elt);
}) as typeof window.getComputedStyle;

/**
 * Node ≥26 自带实验性 `localStorage` 全局 getter（未传 `--localstorage-file` 时返回
 * `undefined`），而 vitest 的 jsdom 环境合并全局键时会把「globalThis 上已存在的键」
 * 剔除、不代理到 jsdom 的实现——于是测试环境里 `window.localStorage` 读到的是 Node
 * 的 undefined，所有走鉴权头的用例都会炸。jsdom 环境的 window 此时已无法找回自己的
 * storage（自有 getter 被 Node 的覆盖），这里新建一个 jsdom window 取它的 storage
 * 挂到全局：Storage 的读写语义与浏览器一致，各测试文件之间是否共享不影响用例
 * （需要在用例间隔离的测试自己 beforeEach clear）。
 */
// Node 26 把 localStorage 定义为 getter（typeof 是 function 而非 'undefined'），
// 不能用 typeof 判定，要看 getter 的返回值是否可用。
try {
  if (
    typeof globalThis.localStorage === 'undefined' ||
    globalThis.localStorage === null
  ) {
    // jsdom 24 没有自带类型声明，只在测试装载期用一次，收窄到用到的方法
    const { JSDOM } = require('jsdom') as {
      JSDOM: new (
        html: string,
        options?: unknown,
      ) => { window: { localStorage: Storage } };
    };
    const storageWindow = new JSDOM('', { url: 'http://localhost/' }).window;
    Object.defineProperty(globalThis, 'localStorage', {
      get: () => storageWindow.localStorage,
      configurable: true,
    });
  }
} catch {
  // getter 本身抛错也视为不可用，同样走兜底
}

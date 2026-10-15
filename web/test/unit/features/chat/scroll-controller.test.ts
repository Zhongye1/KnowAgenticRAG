import { describe, expect, it } from 'vitest';

import { ScrollController } from '@/features/chat/lib/scroll-controller';

/** 滚动位置由外部变量持有的假容器；滚动到底就是把 scrollTop 写成 600。 */
function createMockContainer(initialScrollTop: number) {
  let scrollTop = initialScrollTop;
  let scrollCalled = false;
  return {
    get value() {
      return scrollTop;
    },
    get scrollCalled() {
      return scrollCalled;
    },
    container: {
      scrollHeight: 1000,
      clientHeight: 400,
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(val: number) {
        scrollTop = val;
      },
      scrollTo({ top }: { top: number }) {
        scrollCalled = true;
        scrollTop = top;
      },
    },
  };
}

describe('ScrollController', () => {
  it('用户向上滚动离开底部时停用自动滚动，滚回底部恢复', () => {
    const mock = createMockContainer(520);
    const controller = new ScrollController(() => mock.container, {
      threshold: 80,
      scrollDelay: 20,
    });

    // 初始在底部 (1000 - 520 - 400 = 80 <= threshold)
    expect(controller.isAtBottom()).toBe(true);

    // 用户向上滚动离开底部 (1000 - 200 - 400 = 400 > 80)
    mock.container.scrollTop = 200;
    controller.handleScroll();
    expect(controller.isAtBottom()).toBe(false);
    expect(controller.getAutoScrollEnabled()).toBe(false);

    // 用户滚动回到底部附近 (1000 - 550 - 400 = 50 <= 80)
    mock.container.scrollTop = 550;
    controller.handleScroll();
    expect(controller.isAtBottom()).toBe(true);
    expect(controller.getAutoScrollEnabled()).toBe(true);
  });

  it('shouldAutoScroll 为 false 时 scrollToBottom 不滚动，force 仍执行', async () => {
    const mock = createMockContainer(100);
    const controller = new ScrollController(() => mock.container, {
      threshold: 80,
      scrollDelay: 20,
      retryDelays: [],
    });

    // 用户向上滚动，离开底部
    mock.container.scrollTop = 100;
    controller.handleScroll();
    expect(controller.getAutoScrollEnabled()).toBe(false);

    await controller.scrollToBottom(false);
    expect(mock.scrollCalled).toBe(false);
    expect(mock.value).toBe(100);

    // 强制滚动仍然执行
    await controller.scrollToBottom(true);
    expect(mock.scrollCalled).toBe(true);
    expect(mock.value).toBe(600);
  });

  it('程序性滚动不把自动跟滚误判成用户上滚', async () => {
    const mock = createMockContainer(1000);
    const controller = new ScrollController(() => mock.container, {
      threshold: 80,
      scrollDelay: 20,
      retryDelays: [],
    });

    // scrollToBottom 触发的程序性滚动到达底部后，自动跟滚保持启用
    await controller.scrollToBottom(true);
    expect(mock.value).toBe(600);
    controller.handleScroll();
    expect(controller.getAutoScrollEnabled()).toBe(true);
  });

  it('scrollToBottomStaticForce 恢复自动跟滚', async () => {
    const mock = createMockContainer(100);
    const controller = new ScrollController(() => mock.container, {
      threshold: 80,
      scrollDelay: 20,
      retryDelays: [],
    });

    mock.container.scrollTop = 100;
    controller.handleScroll();
    expect(controller.getAutoScrollEnabled()).toBe(false);

    await controller.scrollToBottomStaticForce();
    expect(mock.value).toBe(600);
    expect(controller.getAutoScrollEnabled()).toBe(true);
  });
});

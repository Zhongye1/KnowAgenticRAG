/**
 * 对话主列的滚动控制。
 *
 * 参照实现 `Yuxi web/src/utils/scrollController.js` 直译：流式输出期间只有用户停在
 * 底部附近才自动跟滚，用户上滚即停；程序性滚动用 `isProgrammaticScroll` 窗口区分，
 * 避免把自动滚动误判成用户上滚。Vue 的 `nextTick` 对应 React 的 flush 后帧，用双
 * requestAnimationFrame 等布局稳定，语义一致。
 *
 * 滚动容器由调用方给（页面持有 `chatMain` 的 ref），不再用选择器查 DOM。
 */

export type ScrollControllerOptions = {
  /** 距底部多少像素内算「在底部」。 */
  threshold?: number;
  /** 程序性滚动窗口与滚动停止判定共用。 */
  scrollDelay?: number;
  /** 滚动到底后的重试延迟：动态内容下一帧补齐高度时再补一次。 */
  retryDelays?: number[];
};

type ContainerLike = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
  scrollTo: (options: { top: number; behavior?: ScrollBehavior }) => void;
};

export class ScrollController {
  private readonly options: Required<ScrollControllerOptions>;
  private readonly getContainer: () => ContainerLike | null;

  private scrollTimer: number | null = null;
  private scrollRetryTimers: number[] = [];
  private programmaticScrollTimer: number | null = null;
  private isUserScrolling = false;
  private shouldAutoScroll = true;
  private isProgrammaticScroll = false;

  /** 滚动事件处理器；调用方把它挂到容器的 scroll 事件上（passive）。 */
  readonly handleScroll = (): void => {
    if (this.scrollTimer) {
      window.clearTimeout(this.scrollTimer);
    }

    // 如果是程序性滚动，仍根据当前位置同步状态，避免标记滞留后误吞用户上滚。
    if (this.isProgrammaticScroll) {
      const atBottom = this.isAtBottom();
      this.shouldAutoScroll = atBottom;
      this.isProgrammaticScroll = false;
      if (this.programmaticScrollTimer) {
        window.clearTimeout(this.programmaticScrollTimer);
        this.programmaticScrollTimer = null;
      }
      if (!atBottom) {
        this.cancelPendingScrolls();
        this.isUserScrolling = true;
        this.scrollTimer = window.setTimeout(() => {
          this.isUserScrolling = false;
        }, this.options.scrollDelay);
      }
      return;
    }

    this.cancelPendingScrolls();
    this.isUserScrolling = true;
    this.shouldAutoScroll = this.isAtBottom();
    this.scrollTimer = window.setTimeout(() => {
      this.isUserScrolling = false;
    }, this.options.scrollDelay);
  };

  constructor(
    getContainer: () => ContainerLike | null,
    options: ScrollControllerOptions = {},
  ) {
    this.getContainer = getContainer;
    this.options = {
      threshold: 40,
      scrollDelay: 100,
      retryDelays: [50, 150],
      ...options,
    };
  }

  isAtBottom(): boolean {
    const container = this.getContainer();
    if (!container) return false;
    return this.getBottomOffset(container) <= this.options.threshold;
  }

  private getBottomOffset(container: ContainerLike): number {
    return Math.max(
      0,
      container.scrollHeight - container.scrollTop - container.clientHeight,
    );
  }

  private cancelPendingScrolls(): void {
    this.scrollRetryTimers.forEach((timer) => window.clearTimeout(timer));
    this.scrollRetryTimers = [];
  }

  private markProgrammaticScroll(): void {
    if (this.programmaticScrollTimer) {
      window.clearTimeout(this.programmaticScrollTimer);
    }
    this.isProgrammaticScroll = true;
    this.programmaticScrollTimer = window.setTimeout(() => {
      this.isProgrammaticScroll = false;
      this.programmaticScrollTimer = null;
    }, this.options.scrollDelay);
  }

  private async waitForLayoutStable(): Promise<void> {
    if (typeof requestAnimationFrame !== 'function') return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  private scrollContainerToBottom(
    container: ContainerLike,
    behavior: ScrollBehavior = 'auto',
  ): void {
    if (!container) return;
    this.markProgrammaticScroll();
    container.scrollTo({
      top: Math.max(0, container.scrollHeight - container.clientHeight),
      behavior,
    });
  }

  /** 智能滚动到底部；用户上滚后不再跟，除非 force。 */
  async scrollToBottom(force = false): Promise<void> {
    await this.waitForLayoutStable();
    if (!force && !this.shouldAutoScroll) return;

    const container = this.getContainer();
    if (!container) return;

    this.cancelPendingScrolls();
    this.scrollContainerToBottom(container, 'auto');

    // 动态内容仍可能在下一帧补齐高度，保留少量重试，但用户手动滚动会立即取消。
    this.options.retryDelays.forEach((delay) => {
      const timer = window.setTimeout(() => {
        if (force || this.shouldAutoScroll) {
          this.scrollContainerToBottom(container, 'auto');
        }
      }, delay);
      this.scrollRetryTimers.push(timer);
    });
  }

  /** 强制滚到底并恢复自动跟滚；切线程加载完历史后用。 */
  async scrollToBottomStaticForce(): Promise<void> {
    const container = this.getContainer();
    if (!container) return;

    this.cancelPendingScrolls();
    await this.waitForLayoutStable();
    this.scrollContainerToBottom(container, 'auto');
    this.shouldAutoScroll = true;
  }

  enableAutoScroll(): void {
    this.shouldAutoScroll = true;
  }

  getAutoScrollEnabled(): boolean {
    return this.shouldAutoScroll;
  }

  cleanup(): void {
    if (this.scrollTimer) {
      window.clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
    if (this.programmaticScrollTimer) {
      window.clearTimeout(this.programmaticScrollTimer);
      this.programmaticScrollTimer = null;
    }
    this.cancelPendingScrolls();
  }

  reset(): void {
    this.cleanup();
    this.isUserScrolling = false;
    this.shouldAutoScroll = true;
    this.isProgrammaticScroll = false;
  }
}

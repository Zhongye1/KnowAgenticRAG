/**
 * 423 锁定倒计时 hook 的时序契约。
 *
 * 逐秒递减与自动解锁是这条路径上唯一带定时器的逻辑，用假定时器盯住：
 * 少一步递减、归零不解锁、或卸载不清定时器，下面的用例都会失败。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { LOCK_TICK_MS, useLoginLock } = await import(
  '@/entities/session/model/login-lock'
);

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe('useLoginLock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('start 后进入锁定态，每秒递减，归零自动解锁', () => {
    const { result } = renderHook(() => useLoginLock());
    expect(result.current.locked).toBe(false);

    act(() => result.current.start(3));
    expect(result.current.locked).toBe(true);
    expect(result.current.lockedLabel).toBe('账户已锁定 3秒');

    advance(LOCK_TICK_MS);
    expect(result.current.remainingSeconds).toBe(2);
    expect(result.current.lockedLabel).toBe('账户已锁定 2秒');

    advance(LOCK_TICK_MS * 2);
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.locked).toBe(false);
  });

  it('拿不到剩余秒数时不进入锁定态', () => {
    const { result } = renderHook(() => useLoginLock());

    act(() => result.current.start(0));

    expect(result.current.locked).toBe(false);
    expect(result.current.remainingSeconds).toBe(0);
  });

  it('clear 立即解锁，之后的计时不再改动状态', () => {
    const { result } = renderHook(() => useLoginLock());

    act(() => result.current.start(60));
    act(() => result.current.clear());
    expect(result.current.locked).toBe(false);

    advance(LOCK_TICK_MS * 3);
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.locked).toBe(false);
  });

  it('卸载时清掉定时器', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { result, unmount } = renderHook(() => useLoginLock());

    act(() => result.current.start(10));
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});

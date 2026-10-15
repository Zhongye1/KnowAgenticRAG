import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HISTORY_SEARCH_DEBOUNCE_MS,
  useDebouncedValue,
} from '@/features/chat/model/project-queries';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('延迟到防抖窗口结束才更新', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, HISTORY_SEARCH_DEBOUNCE_MS),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(HISTORY_SEARCH_DEBOUNCE_MS));
    expect(result.current).toBe('ab');
  });

  it('窗口内继续输入只算最后一次', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, HISTORY_SEARCH_DEBOUNCE_MS),
      { initialProps: { value: '' } },
    );

    rerender({ value: 'a' });
    act(() => vi.advanceTimersByTime(HISTORY_SEARCH_DEBOUNCE_MS - 1));
    rerender({ value: 'ab' });
    act(() => vi.advanceTimersByTime(HISTORY_SEARCH_DEBOUNCE_MS - 1));

    // 还没到第二次输入的窗口末尾
    expect(result.current).toBe('');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('ab');
  });

  it('防抖时长与参照同值', () => {
    expect(HISTORY_SEARCH_DEBOUNCE_MS).toBe(250);
  });
});

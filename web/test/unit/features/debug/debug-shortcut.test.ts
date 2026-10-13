import { beforeEach, describe, expect, it } from 'vitest';

import { isDebugShortcut, useDebugPanel } from '@/features/debug';

const keyEvent = (overrides: Partial<KeyboardEvent> = {}) =>
  ({
    key: 'd',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  }) as KeyboardEvent;

describe('isDebugShortcut', () => {
  it('Ctrl 或 Cmd 加 Shift 加 D 命中，大小写都算', () => {
    expect(isDebugShortcut(keyEvent({ ctrlKey: true, shiftKey: true }))).toBe(
      true,
    );
    expect(isDebugShortcut(keyEvent({ metaKey: true, shiftKey: true }))).toBe(
      true,
    );
    expect(
      isDebugShortcut(keyEvent({ ctrlKey: true, shiftKey: true, key: 'D' })),
    ).toBe(true);
  });

  it('缺 Shift 或修饰键时不命中', () => {
    expect(isDebugShortcut(keyEvent({ ctrlKey: true }))).toBe(false);
    expect(isDebugShortcut(keyEvent({ shiftKey: true }))).toBe(false);
    expect(isDebugShortcut(keyEvent())).toBe(false);
  });

  it('组合键相同但按键不同不命中', () => {
    expect(
      isDebugShortcut(keyEvent({ ctrlKey: true, shiftKey: true, key: 'k' })),
    ).toBe(false);
  });
});

describe('useDebugPanel', () => {
  beforeEach(() => {
    useDebugPanel.setState({ open: false });
  });

  it('初值为关闭', () => {
    expect(useDebugPanel.getState().open).toBe(false);
  });

  it('toggle 在两个入口之间共享同一个开关', () => {
    // 快捷键入口
    useDebugPanel.getState().toggle();
    expect(useDebugPanel.getState().open).toBe(true);

    // 用户菜单入口读到的必须是同一份状态
    expect(useDebugPanel.getState().open).toBe(true);

    useDebugPanel.getState().setOpen(false);
    expect(useDebugPanel.getState().open).toBe(false);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionState, session } = vi.hoisted(() => {
  const state = { isSuperuser: true };
  return {
    sessionState: state,
    session: { useIsSuperuser: () => state.isSuperuser },
  };
});

vi.mock('@/entities/session', () => session);

/** 导航列与调试弹窗各有自己的用例，这里只验证外壳的装配与快捷键门禁。 */
vi.mock('@/widgets/app-sidebar', () => ({
  AppSidebar: () => <nav data-testid="sidebar" />,
}));

vi.mock('@/features/debug', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/debug')>();
  return {
    ...actual,
    DebugModal: ({ open }: { open: boolean }) =>
      open ? <span data-testid="debug-modal" /> : null,
  };
});

const { AppShell } = await import('@/app/layouts/app-shell');
const { useDebugPanel } = await import('@/features/debug');

const pressShortcut = () =>
  fireEvent.keyDown(window, { key: 'd', ctrlKey: true, shiftKey: true });

const renderShell = () =>
  render(
    <AppShell>
      <span data-testid="page" />
    </AppShell>,
  );

describe('外壳的调试面板快捷键', () => {
  beforeEach(() => {
    sessionState.isSuperuser = true;
    useDebugPanel.setState({ open: false });
  });

  it('超管按 Ctrl+Shift+D 打开面板', () => {
    renderShell();

    pressShortcut();

    expect(useDebugPanel.getState().open).toBe(true);
    expect(screen.getByTestId('debug-modal')).toBeInTheDocument();
  });

  it('普通用户按同一个组合键不打开面板，也不挂载面板', () => {
    sessionState.isSuperuser = false;
    renderShell();

    pressShortcut();

    expect(useDebugPanel.getState().open).toBe(false);
    expect(screen.queryByTestId('debug-modal')).toBeNull();
  });

  it('缺少 Shift 时不触发', () => {
    renderShell();

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });

    expect(useDebugPanel.getState().open).toBe(false);
  });

  it('卸载后不再响应快捷键', () => {
    const { unmount } = renderShell();
    unmount();

    pressShortcut();

    expect(useDebugPanel.getState().open).toBe(false);
  });
});

describe('外壳的装配', () => {
  beforeEach(() => {
    sessionState.isSuperuser = true;
    useDebugPanel.setState({ open: false });
  });

  it('导航列与内容区同时渲染，内容由调用方提供', () => {
    renderShell();

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });
});

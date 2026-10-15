/**
 * 数据总览页：两个 tab 与「点过才加载」。
 *
 * 关键业务结果：首屏只挂载当前 tab（未激活的 tab 连查询都不会发）、
 * 激活过的 tab 切回来不卸载、`?tab=` 可深链且只写非默认值、
 * 概览与会话分析两个入口共用同一个反馈弹窗实例。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mounts } = vi.hoisted(() => ({ mounts: [] as string[] }));

vi.mock('@/features/dashboard', async () => {
  const React = await import('react');
  const Tab = ({
    label,
    onOpenFeedback,
  }: {
    label: string;
    onOpenFeedback: () => void;
  }) => {
    React.useEffect(() => {
      mounts.push(label);
    }, [label]);
    return (
      <button type="button" onClick={onOpenFeedback}>
        打开反馈
      </button>
    );
  };
  return {
    DashboardOverviewTab: ({
      onOpenFeedback,
    }: {
      onOpenFeedback: () => void;
    }) => <Tab label="overview" onOpenFeedback={onOpenFeedback} />,
    DashboardThreadsTab: ({
      onOpenFeedback,
    }: {
      onOpenFeedback: () => void;
    }) => <Tab label="threads" onOpenFeedback={onOpenFeedback} />,
    FeedbackDialog: ({ open }: { open: boolean }) =>
      open ? <div data-testid="feedback-dialog">反馈弹窗</div> : null,
  };
});

const { DashboardPage } = await import('@/pages/dashboard');

/** 回显当前 search，供断言 URL 是否真的跟着 tab 走。 */
const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
};

const renderPage = (initialEntry = '/dashboard') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DashboardPage />
      <LocationProbe />
    </MemoryRouter>,
  );

beforeEach(() => {
  mounts.length = 0;
});

describe('tab 与路由参数', () => {
  it('默认停在系统概览，只挂载 overview', () => {
    renderPage();
    expect(
      screen
        .getByRole('button', { name: '系统概览' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(mounts).toEqual(['overview']);
    expect(screen.getByTestId('location').textContent).toBe('');
  });

  it('深链 ?tab=threads 只挂载会话分析，且不改写 URL', () => {
    renderPage('/dashboard?tab=threads');
    expect(mounts).toEqual(['threads']);
    expect(
      screen
        .getByRole('button', { name: '会话分析' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(screen.getByTestId('location').textContent).toBe('?tab=threads');
  });

  it('未知 tab 值归到系统概览', () => {
    renderPage('/dashboard?tab=unknown');
    expect(mounts).toEqual(['overview']);
  });

  it('点会话分析写入 ?tab=threads，且 overview 不卸载', async () => {
    // 变异：不保留激活集合会让切回来重新取数并重建图表
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '会话分析' }));

    expect(mounts).toEqual(['overview', 'threads']);
    expect(screen.getByTestId('location').textContent).toBe('?tab=threads');
    // 两个 tab 的容器都在 DOM 里，非当前的用 hidden 收起
    const hidden = document.querySelectorAll('[hidden]');
    expect(hidden).toHaveLength(1);
    expect(hidden[0].textContent).toContain('打开反馈');
  });

  it('切回系统概览清掉 tab 参数，两个 tab 仍只挂载一次', async () => {
    renderPage('/dashboard?tab=threads');
    await userEvent.click(screen.getByRole('button', { name: '系统概览' }));

    expect(mounts).toEqual(['threads', 'overview']);
    expect(screen.getByTestId('location').textContent).toBe('');
  });
});

describe('反馈弹窗', () => {
  it('概览入口打开页面级弹窗', async () => {
    renderPage();
    expect(screen.queryByTestId('feedback-dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '打开反馈' }));
    expect(screen.getByTestId('feedback-dialog')).toBeTruthy();
  });

  it('会话分析入口打开的是同一个弹窗实例', async () => {
    renderPage('/dashboard?tab=threads');
    await userEvent.click(screen.getByRole('button', { name: '打开反馈' }));
    expect(
      within(screen.getByTestId('feedback-dialog')).getByText('反馈弹窗'),
    ).toBeTruthy();
    expect(screen.getAllByTestId('feedback-dialog')).toHaveLength(1);
  });
});

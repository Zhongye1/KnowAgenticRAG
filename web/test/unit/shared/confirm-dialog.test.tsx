import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDialogHost } from '@/shared/ui/confirm-dialog-host';
import { confirm, useConfirmStore } from '@/shared/ui/confirm-dialog';

const renderHost = () => render(<ConfirmDialogHost />);

describe('命令式确认框', () => {
  beforeEach(() => {
    useConfirmStore.setState({ pending: null });
  });

  it('确认后以 true 结束，且弹窗关闭', async () => {
    renderHost();
    const answer = confirm({ title: '删除知识库' });

    expect(await screen.findByText('删除知识库')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '确定' }));

    await expect(answer).resolves.toBe(true);
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull());
  });

  it('取消后以 false 结束', async () => {
    renderHost();
    const answer = confirm({ title: '删除文件', description: '不可恢复' });

    expect(await screen.findByText('不可恢复')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '取消' }));

    await expect(answer).resolves.toBe(false);
  });

  it('自定义按钮文案与危险色', async () => {
    renderHost();
    const answer = confirm({
      title: '重置图谱',
      confirmText: '重置',
      cancelText: '再想想',
      destructive: true,
    });

    expect(await screen.findByRole('button', { name: '再想想' })).toBeTruthy();
    const button = screen.getByRole('button', { name: '重置' });
    expect(button.className).toContain('text-destructive');
    await userEvent.click(button);

    await expect(answer).resolves.toBe(true);
  });

  it('新请求顶掉旧请求时，旧请求以 false 结束而不是悬空', async () => {
    renderHost();
    const first = confirm({ title: '第一个' });
    const second = confirm({ title: '第二个' });

    await expect(first).resolves.toBe(false);
    expect(await screen.findByText('第二个')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '确定' }));
    await expect(second).resolves.toBe(true);
  });

  it('按 Esc 关闭视为取消', async () => {
    renderHost();
    const answer = confirm({ title: '删除' });
    expect(await screen.findByText('删除')).toBeTruthy();

    await userEvent.keyboard('{Escape}');

    await expect(answer).resolves.toBe(false);
  });

  it('没有请求时不渲染弹窗', () => {
    renderHost();

    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });
});

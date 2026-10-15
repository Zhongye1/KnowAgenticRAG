import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntdApp } from 'antd';
import { describe, expect, it } from 'vitest';

import { useConfirm } from '@/shared/ui/confirm-dialog';

/**
 * 确认框现在是 antd `modal.confirm` 的语义封装；断言走真实 antd 渲染
 * （antd App 上下文内），覆盖确认/取消/危险色/Esc 四条用户可观察行为。
 */
const Probe = ({
  onAnswer,
  options,
}: {
  onAnswer: (answer: boolean) => void;
  options: Parameters<ReturnType<typeof useConfirm>['confirm']>[0];
}) => {
  const { confirm } = useConfirm();

  return (
    <button type="button" onClick={() => void confirm(options).then(onAnswer)}>
      触发
    </button>
  );
};

const renderConfirm = (
  options: Parameters<ReturnType<typeof useConfirm>['confirm']>[0],
) => {
  const answers: boolean[] = [];
  render(
    <AntdApp>
      <Probe options={options} onAnswer={(answer) => answers.push(answer)} />
    </AntdApp>,
  );
  return answers;
};

describe('命令式确认框（antd modal.confirm 封装）', () => {
  it('确认后以 true 结束', async () => {
    const answers = renderConfirm({ title: '删除知识库' });

    await userEvent.click(screen.getByRole('button', { name: '触发' }));
    await userEvent.click(await screen.findByRole('button', { name: '确 定' }));

    expect(answers).toEqual([true]);
  });

  it('取消后以 false 结束', async () => {
    const answers = renderConfirm({
      title: '删除文件',
      description: '不可恢复',
    });

    await userEvent.click(screen.getByRole('button', { name: '触发' }));
    await userEvent.click(await screen.findByRole('button', { name: '取 消' }));

    expect(answers).toEqual([false]);
  });

  it('自定义按钮文案与危险色', async () => {
    const answers = renderConfirm({
      title: '重置图谱设置',
      confirmText: '重置设置',
      cancelText: '再想想',
      destructive: true,
    });

    await userEvent.click(screen.getByRole('button', { name: '触发' }));
    const button = await screen.findByRole('button', { name: '重置设置' });
    expect(button.className).toContain('ant-btn-dangerous');
    await userEvent.click(button);

    expect(answers).toEqual([true]);
  });

  it('按 Esc 关闭视为取消', async () => {
    const answers = renderConfirm({ title: '删除会话记录' });

    await userEvent.click(screen.getByRole('button', { name: '触发' }));
    // antd confirm 的 title 会渲染成两处（modal-confirm 头部与 title 元素），用 selector 定位
    await screen.findByText('删除会话记录', {
      selector: '.ant-modal-confirm-title',
    });
    // rc-dialog 把 keydown 挂在 wrapper（tabIndex=-1）上；userEvent 的 keyboard
    // 聚焦 body 触发不到，这里直接对 wrapper 派发 Esc（keyCode 27）
    fireEvent.keyDown(
      document.querySelector('.ant-modal-wrap') ?? document.body,
      { keyCode: 27, key: 'Escape' },
    );
    // rc-dialog 的关闭动画结束后 promise 才 resolve
    await waitFor(() => expect(answers).toEqual([false]));
  });
});

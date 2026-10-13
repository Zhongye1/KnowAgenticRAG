import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MentionEditor } from '@/features/chat/ui/mention-editor';

const editor = () => screen.getByRole('textbox', { name: '消息输入' });

describe('MentionEditor', () => {
  it('把已有令牌渲染成芯片，显示展示名', () => {
    render(
      <MentionEditor
        value="@file:/a/报表.pdf"
        onChange={vi.fn()}
        ariaLabel="消息输入"
      />,
    );

    const chip = editor().querySelector('[data-mention-raw]');
    expect(chip).not.toBeNull();
    expect(chip!.getAttribute('data-mention-raw')).toBe('@file:/a/报表.pdf');
    expect(chip!.textContent).toBe('报表.pdf');
    expect(chip!.getAttribute('contenteditable')).toBe('false');
  });

  it('外部值变化时重建内容', () => {
    const { rerender } = render(
      <MentionEditor value="第一版" onChange={vi.fn()} ariaLabel="消息输入" />,
    );
    expect(editor().textContent).toBe('第一版');

    rerender(
      <MentionEditor value="第二版" onChange={vi.fn()} ariaLabel="消息输入" />,
    );
    expect(editor().textContent).toBe('第二版');
  });

  it('输入后回调序列化文本', async () => {
    const onChange = vi.fn();
    render(
      <MentionEditor value="" onChange={onChange} ariaLabel="消息输入" />,
    );

    editor().textContent = '你好';
    await userEvent.type(editor(), '{Enter}');

    expect(onChange).toHaveBeenCalled();
  });

  it('回车提交，Shift+回车不提交', async () => {
    const onSubmit = vi.fn();
    render(
      <MentionEditor
        value=""
        onChange={vi.fn()}
        onSubmit={onSubmit}
        ariaLabel="消息输入"
      />,
    );

    await userEvent.type(editor(), '{Shift>}{Enter}{/Shift}');
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(editor(), '{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('禁用时不可编辑且不接收输入', async () => {
    const onSubmit = vi.fn();
    render(
      <MentionEditor
        value=""
        onChange={vi.fn()}
        onSubmit={onSubmit}
        disabled
        ariaLabel="消息输入"
      />,
    );

    expect(editor().getAttribute('contenteditable')).toBe('false');
  });
});

describe('MentionEditor 的拖放', () => {
  const drop = (files: File[]) => {
    const target = editor().parentElement!;
    const dataTransfer = {
      types: ['Files'],
      files,
      dropEffect: 'none',
    } as unknown as DataTransfer;

    return { target, dataTransfer };
  };

  it('拖入文件时回调文件列表', async () => {
    const onDropFiles = vi.fn();
    render(
      <MentionEditor
        value=""
        onChange={vi.fn()}
        onDropFiles={onDropFiles}
        ariaLabel="消息输入"
      />,
    );

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const { target, dataTransfer } = drop([file]);
    fireEvent.drop(target, { dataTransfer });

    expect(onDropFiles).toHaveBeenCalledWith([file]);
  });

  it('没有拖放回调时不拦截，也不回调', async () => {
    const onDropFiles = vi.fn();
    render(
      <MentionEditor value="" onChange={vi.fn()} ariaLabel="消息输入" />,
    );

    const { target, dataTransfer } = drop([
      new File(['x'], 'a.png', { type: 'image/png' }),
    ]);
    fireEvent.drop(target, { dataTransfer });

    expect(onDropFiles).not.toHaveBeenCalled();
  });

  it('拖的不是文件时不处理', async () => {
    const onDropFiles = vi.fn();
    render(
      <MentionEditor
        value=""
        onChange={vi.fn()}
        onDropFiles={onDropFiles}
        ariaLabel="消息输入"
      />,
    );

    const target = editor().parentElement!;
    fireEvent.drop(target, {
      dataTransfer: {
        types: ['text/plain'],
        files: [],
        dropEffect: 'none',
      } as unknown as DataTransfer,
    });

    expect(onDropFiles).not.toHaveBeenCalled();
  });
});

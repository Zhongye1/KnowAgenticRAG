import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { MentionResourceItem } from '@/features/chat/lib/mention-resources';
import {
  MentionEditor,
  type MentionEditorHandle,
} from '@/features/chat/ui/mention-editor';

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
    render(<MentionEditor value="" onChange={onChange} ariaLabel="消息输入" />);

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

describe('MentionEditor 的命令式插入', () => {
  const item: MentionResourceItem = {
    value: '产品文档',
    label: '产品文档',
    type: 'knowledge',
    tokenLabel: '@knowledge:产品文档',
    description: '',
  };

  it('光标不在编辑器里时把令牌追加到末尾', () => {
    const onChange = vi.fn();
    const ref = React.createRef<MentionEditorHandle>();
    render(
      <MentionEditor
        ref={ref}
        value="先看"
        onChange={onChange}
        ariaLabel="消息输入"
      />,
    );

    act(() => ref.current!.insertMentionToken(item));

    expect(onChange).toHaveBeenCalledWith('先看@knowledge:产品文档 ');
    expect(editor().querySelector('[data-mention-raw]')).not.toBeNull();
  });

  it('禁用时不插入', () => {
    const onChange = vi.fn();
    const ref = React.createRef<MentionEditorHandle>();
    render(
      <MentionEditor
        ref={ref}
        value=""
        onChange={onChange}
        disabled
        ariaLabel="消息输入"
      />,
    );

    act(() => ref.current!.insertMentionToken(item));

    expect(onChange).not.toHaveBeenCalled();
  });
});

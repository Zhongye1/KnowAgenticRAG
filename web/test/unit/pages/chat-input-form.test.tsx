import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChatInputForm } from '@/pages/chat/ui/chat-input-form';
import type { ChatInputFormProps } from '@/pages/chat/ui/chat-input-form';

const noop = () => {};

const baseProps = (): ChatInputFormProps => ({
  agentOptions: [
    {
      value: 'default-chatbot',
      label: '默认对话助手',
      icon: '',
      isBuiltin: true,
    },
  ],
  agentSlug: 'default-chatbot',
  agentsLoading: false,
  hasActiveThread: true,
  isCreatingThread: false,
  onSelectAgent: noop,
  onAgentBlocked: noop,
  toolApprovalMode: 'default',
  onChangeToolApprovalMode: noop,
  tokenUsage: null,
  onContextRingClick: noop,
  modelSelected: '',
  modelGroups: [],
  modelsLoading: false,
  onSelectModel: noop,
  canSteerNow: false,
  onSteer: noop,
  onOpenAttachments: noop,
  imagePending: false,
  imageFileInputRef: React.createRef<HTMLInputElement>(),
  onImageFileChange: noop,
  image: null,
  onRemoveImage: noop,
  pendingAttachments: [],
  input: '',
  onInputPaste: noop,
  onInputChange: noop,
  onSubmit: noop,
  inputPlaceholder: '输入消息',
  mentionItems: [],
  mentionLabels: {},
  onSearchFiles: async () => [],
  onDropFiles: noop,
  canSend: false,
  isStreaming: false,
  onCancelRun: noop,
});

/** 胶囊：从编辑器向上取表单的直接子 div——顶灰条也是表单的子 div，不能按下标取。 */
const capsule = () =>
  screen.getByLabelText('消息输入').closest('form > div') as HTMLElement;

/** 造一份拖放数据：`types` 与 `files` 的形状与浏览器一致。 */
const dragData = (files: File[], types = ['Files']) =>
  ({ types, files, dropEffect: 'none' }) as unknown as DataTransfer;

describe('ChatInputForm 的拖放', () => {
  it('拖入文件时高亮整个胶囊，放下后回调并收掉高亮', () => {
    const onDropFiles = vi.fn();
    render(<ChatInputForm {...baseProps()} onDropFiles={onDropFiles} />);

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.dragEnter(capsule(), { dataTransfer: dragData([file]) });
    expect(capsule().hasAttribute('data-dragging')).toBe(true);

    fireEvent.drop(capsule(), { dataTransfer: dragData([file]) });
    expect(onDropFiles).toHaveBeenCalledWith([file]);
    expect(capsule().hasAttribute('data-dragging')).toBe(false);
  });

  it('拖出胶囊时收掉高亮，在胶囊内移动不收', () => {
    render(<ChatInputForm {...baseProps()} onDropFiles={vi.fn()} />);

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.dragEnter(capsule(), { dataTransfer: dragData([file]) });

    // jsdom 的 DragEvent 不接受 relatedTarget，这里直接造事件把「移到子元素」喂进去
    const move = new MouseEvent('dragleave', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(move, 'relatedTarget', {
      value: screen.getByLabelText('消息输入'),
    });
    fireEvent(capsule(), move);
    expect(capsule().hasAttribute('data-dragging')).toBe(true);

    fireEvent.dragLeave(capsule(), { dataTransfer: dragData([file]) });
    expect(capsule().hasAttribute('data-dragging')).toBe(false);
  });

  it('拖的不是文件时不拦默认行为，也不高亮', () => {
    const onDropFiles = vi.fn();
    render(<ChatInputForm {...baseProps()} onDropFiles={onDropFiles} />);

    const dataTransfer = dragData([], ['text/plain']);
    fireEvent.dragEnter(capsule(), { dataTransfer });

    expect(capsule().hasAttribute('data-dragging')).toBe(false);
    expect(fireEvent.drop(capsule(), { dataTransfer })).toBe(true);
    expect(onDropFiles).not.toHaveBeenCalled();
  });
});

describe('ChatInputForm 的发送与停止', () => {
  it('运行中保持可点，点了停止而不是发送', async () => {
    const onCancelRun = vi.fn();
    const onSubmit = vi.fn();
    render(
      <ChatInputForm
        {...baseProps()}
        canSend={false}
        isStreaming
        onCancelRun={onCancelRun}
        onSubmit={onSubmit}
      />,
    );

    // canSend 要求 !isStreaming，运行中必然是 false；停止钮不能被它一起禁用
    const stop = screen.getByRole('button', { name: '停止回答' });
    expect(stop).toBeEnabled();

    await userEvent.click(stop);
    expect(onCancelRun).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('空闲且不能发送时禁用', () => {
    render(<ChatInputForm {...baseProps()} canSend={false} />);

    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
  });
});

describe('ChatInputForm 的顶区', () => {
  it('没有图片与附件时不渲染顶区', () => {
    const { container } = render(<ChatInputForm {...baseProps()} />);

    // 顶区在参照里有 8px 下边距，空着渲染会白占高度
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText('待发送.pdf')).toBeNull();
  });

  it('图片与待发送附件都渲染在胶囊内', () => {
    render(
      <ChatInputForm
        {...baseProps()}
        image={{
          imageContent: 'AA==',
          mimeType: 'image/png',
          originalName: '截图.png',
        }}
        pendingAttachments={[
          {
            fileId: 'f1',
            fileName: '待发送.pdf',
            fileType: 'application/pdf',
            fileSize: 2048,
            status: 'parsed',
            requestId: null,
          },
        ]}
      />,
    );

    expect(screen.getByTestId('image-attachment')).toBeTruthy();
    expect(screen.getByText('待发送.pdf')).toBeTruthy();
    expect(screen.getByText('2 KB')).toBeTruthy();
  });
});

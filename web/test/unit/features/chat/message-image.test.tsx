import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '@/features/chat/api/agent-api';
import { ImageAttachmentPreview } from '@/features/chat/ui/image-attachment-preview';
import { MessageItem } from '@/features/chat/ui/message-item';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUg';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQ';

describe('待发送图片预览', () => {
  const image = {
    imageContent: PNG_BASE64,
    mimeType: 'image/png',
    originalName: '截图.png',
  };

  it('按上传时拿到的 MIME 渲染，而不是写死 png', () => {
    render(
      <ImageAttachmentPreview
        image={{ ...image, imageContent: JPEG_BASE64, mimeType: 'image/jpeg' }}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByAltText('截图.png').getAttribute('src')).toBe(
      `data:image/jpeg;base64,${JPEG_BASE64}`,
    );
  });

  it('点移除按钮通知调用方清空图片槽', async () => {
    const onRemove = vi.fn();
    render(<ImageAttachmentPreview image={image} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: '移除图片' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});

describe('历史消息里的图片', () => {
  const humanWithImage = (imageContent: string): ChatMessage => ({
    id: 1,
    type: 'human',
    content: '看图',
    image_content: imageContent,
  });

  it('按 base64 魔数反推 MIME，jpeg 不会被当成 png', () => {
    render(<MessageItem message={humanWithImage(JPEG_BASE64)} />);

    expect(screen.getByAltText('用户上传的图片').getAttribute('src')).toBe(
      `data:image/jpeg;base64,${JPEG_BASE64}`,
    );
  });

  it('点击图片打开遮罩，按 Esc 关闭', async () => {
    render(<MessageItem message={humanWithImage(PNG_BASE64)} />);

    await userEvent.click(screen.getByRole('button', { name: '查看大图' }));
    expect(await screen.findByTestId('image-lightbox')).toBeTruthy();

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByTestId('image-lightbox')).toBeNull(),
    );
  });

  it('没有图片的用户消息不出现查看大图入口', () => {
    render(
      <MessageItem message={{ id: 2, type: 'human', content: '纯文本' }} />,
    );

    expect(screen.queryByRole('button', { name: '查看大图' })).toBeNull();
  });
});

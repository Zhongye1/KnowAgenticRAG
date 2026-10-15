import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MentionResourceItem } from '@/features/chat/lib/mention-resources';
import { ComposerOptions } from '@/features/chat/ui/composer-options';

const resource = (
  type: MentionResourceItem['type'],
  label: string,
): MentionResourceItem => ({
  value: label,
  label,
  type,
  tokenLabel: `@${type}:${label}`,
  description: '',
});

const openPanel = async () => {
  await userEvent.click(screen.getByRole('button', { name: '添加内容' }));
};

const renderOptions = (
  overrides: Partial<Parameters<typeof ComposerOptions>[0]> = {},
) => {
  const props = {
    mentionItems: [] as MentionResourceItem[],
    imagePending: false,
    onOpenAttachments: vi.fn(),
    onUploadImage: vi.fn(),
    onInsertMention: vi.fn(),
    ...overrides,
  };
  render(<ComposerOptions {...props} />);
  return props;
};

describe('ComposerOptions', () => {
  it('展开后列出添加附件与上传图片', async () => {
    renderOptions();
    await openPanel();

    expect(
      screen.getByRole('menuitem', { name: '添加附件' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: '上传图片' }),
    ).toBeInTheDocument();
  });

  it('点「添加附件」回调并收起面板', async () => {
    const props = renderOptions();
    await openPanel();

    await userEvent.click(screen.getByRole('menuitem', { name: '添加附件' }));

    expect(props.onOpenAttachments).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: '添加附件' })).toBeNull();
  });

  it('点「上传图片」回调选图入口', async () => {
    const props = renderOptions();
    await openPanel();

    await userEvent.click(screen.getByRole('menuitem', { name: '上传图片' }));

    expect(props.onUploadImage).toHaveBeenCalledTimes(1);
  });

  it('流式中「上传图片」不可用，附件仍可添加', async () => {
    renderOptions({ disabled: true });
    await openPanel();

    expect(screen.getByRole('menuitem', { name: '上传图片' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: '添加附件' })).toBeEnabled();
  });

  it('没有知识库与技能候选时不出现分组', async () => {
    renderOptions();
    await openPanel();

    expect(screen.queryByRole('menuitem', { name: /知识库/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /技能/ })).toBeNull();
  });

  it('有候选时进入分组，选中即插入令牌并收起', async () => {
    const props = renderOptions({
      mentionItems: [resource('knowledge', '产品文档')],
    });
    await openPanel();

    await userEvent.click(screen.getByRole('menuitem', { name: /知识库/ }));

    // 二级页只有这一组的条目，返回行与条目同层
    expect(
      screen.getByRole('button', { name: '返回添加内容菜单' }),
    ).toBeTruthy();
    const item = screen.getByRole('menuitem', { name: /产品文档/ });
    expect(item).toBeTruthy();

    await userEvent.click(item);

    expect(props.onInsertMention).toHaveBeenCalledWith(
      expect.objectContaining({ label: '产品文档', type: 'knowledge' }),
    );
    expect(screen.queryByRole('menuitem', { name: /产品文档/ })).toBeNull();
  });

  it('返回行回到一级页', async () => {
    renderOptions({ mentionItems: [resource('skill', '检索增强')] });
    await openPanel();
    await userEvent.click(screen.getByRole('menuitem', { name: /技能/ }));

    await userEvent.click(
      screen.getByRole('button', { name: '返回添加内容菜单' }),
    );

    expect(screen.getByRole('menuitem', { name: '添加附件' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /检索增强/ })).toBeNull();
  });

  it('图片上传中时用加载态代替图标', async () => {
    renderOptions({ imagePending: true });
    await openPanel();

    const item = screen.getByRole('menuitem', { name: '上传图片' });
    expect(item.querySelector('.ant-spin')).not.toBeNull();
  });
});

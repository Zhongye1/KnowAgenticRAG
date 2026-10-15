import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileRowActions } from '@/features/knowledge-base/ui/files/table/file-row-actions';

const file = (extra: Record<string, unknown> = {}) => ({
  file_id: 'f-1',
  filename: '报表.pdf',
  status: 'indexed',
  file_size: 1024,
  chunk_count: 0,
  token_count: 0,
  is_folder: false,
  has_children: false,
  children_count: 0,
  has_original_file: true,
  has_parsed_markdown: true,
  is_virtual_folder: false,
  ...extra,
});

const renderActions = (
  props: Partial<Parameters<typeof FileRowActions>[0]>,
) => {
  const handlers = {
    onDownload: vi.fn(),
    onParse: vi.fn(),
    onIndex: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <FileRowActions
      file={file()}
      readOnly={false}
      locked={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

const openMenu = async (filename = '报表.pdf') => {
  await userEvent.click(
    screen.getByRole('button', { name: `文件操作：${filename}` }),
  );
};

/** antd Dropdown 的菜单项是 `<li role="menuitem">`，禁用态走 aria-disabled。 */
const menuItem = (name: RegExp) => screen.getByRole('menuitem', { name });

const expectMenuItemDisabled = (name: RegExp) =>
  expect(menuItem(name)).toHaveAttribute('aria-disabled', 'true');

const expectMenuItemEnabled = (name: RegExp) =>
  expect(menuItem(name).getAttribute('aria-disabled')).not.toBe('true');

describe('文件行操作菜单', () => {
  it('已入库的文件可下载、重新入库与删除', async () => {
    const handlers = renderActions({});
    await openMenu();

    expectMenuItemEnabled(/下载文件/);
    expectMenuItemEnabled(/重新入库/);
    expectMenuItemEnabled(/删除文件/);
    // 已入库没有主操作
    expect(screen.queryByRole('menuitem', { name: /^入库$/ })).toBeNull();

    await userEvent.click(screen.getByRole('menuitem', { name: /重新入库/ }));
    expect(handlers.onIndex).toHaveBeenCalledTimes(1);
  });

  it('待解析的文件给出「解析文件」，重试解析用同一入口', async () => {
    const handlers = renderActions({ file: file({ status: 'uploaded' }) });
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: /解析文件/ }));
    expect(handlers.onParse).toHaveBeenCalledTimes(1);
  });

  it('待入库与重试入库各给出自己的入库文案', async () => {
    const handlers = renderActions({
      file: file({ status: 'error_indexing' }),
    });
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: /重试入库/ }));
    expect(handlers.onIndex).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: /下载文件/ })).toBeNull();
  });

  it('处理中的文件关掉会改状态的入口', async () => {
    renderActions({ file: file({ status: 'parsing' }) });
    await openMenu();

    expectMenuItemDisabled(/下载文件/);
    expectMenuItemDisabled(/删除文件/);
  });

  it('有操作在飞行中时入口点不动', async () => {
    const handlers = renderActions({ locked: true });
    await openMenu();

    expectMenuItemDisabled(/下载文件/);
    expectMenuItemDisabled(/重新入库/);
    expectMenuItemDisabled(/删除文件/);

    await userEvent.click(screen.getByRole('menuitem', { name: /删除文件/ }));
    expect(handlers.onDelete).not.toHaveBeenCalled();
    expect(handlers.onDownload).not.toHaveBeenCalled();
  });

  it('只读知识库只留下载', async () => {
    renderActions({ readOnly: true });
    await openMenu();

    expectMenuItemEnabled(/下载文件/);
    expect(screen.queryByRole('menuitem', { name: /入库/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /删除文件/ })).toBeNull();
  });

  it('目录有移动与删除文件夹，虚拟目录没有入口', async () => {
    renderActions({
      file: file({ is_folder: true, filename: '目录A', status: 'done' }),
    });
    await openMenu('目录A');

    expectMenuItemEnabled(/删除文件夹/);
    expectMenuItemEnabled(/移动到…/);
    expect(screen.queryByRole('menuitem', { name: /下载文件/ })).toBeNull();
  });

  it('有操作在飞行中或有只读标记时，目录的删除也关掉', async () => {
    renderActions({
      file: file({ is_folder: true, filename: '目录A', status: 'done' }),
      locked: true,
    });
    await openMenu('目录A');
    expectMenuItemDisabled(/删除文件夹/);
    expectMenuItemDisabled(/移动到…/);
  });

  it('只读知识库的目录没有删除与移动', async () => {
    renderActions({
      file: file({ is_folder: true, filename: '目录A', status: 'done' }),
      readOnly: true,
    });
    await openMenu('目录A');
    expectMenuItemDisabled(/删除文件夹/);
    expect(screen.queryByRole('menuitem', { name: /移动到…/ })).toBeNull();
  });

  it('虚拟目录不渲染操作入口', () => {
    renderActions({
      file: file({
        is_folder: true,
        is_virtual_folder: true,
        filename: 'brief',
      }),
    });

    expect(screen.queryByRole('button', { name: /文件操作/ })).toBeNull();
  });
});

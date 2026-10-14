import { describe, expect, it } from 'vitest';

import {
  QUICK_ACCESS,
  isQuickAccessPath,
  isWorkspaceRoot,
  pruneSelection,
} from '@/features/workspace';
import { isSamePath } from '@/shared/lib/workspace-path';
import {
  buildWorkspaceRows,
  workspaceBreadcrumbs,
} from '@/features/workspace/lib/workspace-view';
import type { FileEntry } from '@/shared/lib/filesystem-entry';

const entry = (
  path: string,
  { isDir = false, size = 0, modifiedAt = '' } = {},
): FileEntry => ({
  path,
  name: path.split('/').filter(Boolean).pop() ?? path,
  isDir,
  size,
  modifiedAt,
});

describe('workspaceBreadcrumbs', () => {
  it('根固定是「全部文件」，后面按路径逐段', () => {
    expect(workspaceBreadcrumbs('/')).toEqual([
      { name: '全部文件', path: '/' },
    ]);
    expect(workspaceBreadcrumbs('/agents/')).toEqual([
      { name: '全部文件', path: '/' },
      { name: 'agents', path: '/agents/' },
    ]);
    expect(workspaceBreadcrumbs('/agents/skills/')).toEqual([
      { name: '全部文件', path: '/' },
      { name: 'agents', path: '/agents/' },
      { name: 'skills', path: '/agents/skills/' },
    ]);
  });
});

describe('isQuickAccessPath / isSamePath', () => {
  it('快速访问项自身与子树都算「在快速访问里」', () => {
    const agents = QUICK_ACCESS[0].path;
    expect(isQuickAccessPath('/agents/')).toBe(true);
    expect(isQuickAccessPath('/agents/skills/')).toBe(true);
    expect(isQuickAccessPath('/agents2/')).toBe(false);
    expect(isQuickAccessPath('/')).toBe(false);
  });

  it('快速访问项的高亮是严格同层（参照口径）：子目录里没有任何一项高亮', () => {
    const agents = QUICK_ACCESS[0].path;
    expect(isSamePath('/agents/', agents)).toBe(true);
    expect(isSamePath('/agents', agents)).toBe(true);
    expect(isSamePath('/agents/skills/', agents)).toBe(false);
  });

  it('两项指向的路径与后端约定一致', () => {
    expect(QUICK_ACCESS.map((item) => item.path)).toEqual([
      '/agents/',
      '/saved_artifacts',
    ]);
  });
});

describe('isWorkspaceRoot', () => {
  it('根路径的去尾斜杠比较', () => {
    expect(isWorkspaceRoot('/')).toBe(true);
    expect(isWorkspaceRoot('')).toBe(true);
    expect(isWorkspaceRoot('/agents/')).toBe(false);
  });
});

describe('buildWorkspaceRows', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');

  it('目录不给下载、不给编辑；大小与修改时间按参照格式化', () => {
    const rows = buildWorkspaceRows(
      [
        entry('/agents/', { isDir: true }),
        entry('/agents/AGENTS.md', {
          size: 1024,
          modifiedAt: '2026-10-11T12:00:00Z',
        }),
      ],
      now,
    );

    expect(rows[0]).toMatchObject({
      key: '/agents/',
      name: 'agents',
      sizeLabel: '-',
      isDir: true,
      canDownload: false,
      editable: false,
    });
    expect(rows[1]).toMatchObject({
      key: '/agents/AGENTS.md',
      sizeLabel: '1 KB',
      modifiedLabel: '3 天前',
      canDownload: true,
      editable: true,
    });
  });

  it('名字缺失时退到路径，避免出现没有标题的行', () => {
    const rows = buildWorkspaceRows([
      {
        path: '/agents/skills/',
        name: '',
        isDir: true,
        size: 0,
        modifiedAt: '',
      },
    ]);

    expect(rows[0].name).toBe('/agents/skills/');
  });
});

describe('pruneSelection', () => {
  it('只保留仍在当前目录里的选中项', () => {
    expect(
      pruneSelection(['/a.md', '/gone.md'], [entry('/a.md'), entry('/b.md')]),
    ).toEqual(['/a.md']);
  });

  it('空选中集原样返回', () => {
    expect(pruneSelection([], [entry('/a.md')])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  isSameOrChildPath,
  normalizePathKey,
  pathBreadcrumbs,
} from '@/shared/lib/workspace-path';

describe('normalizePathKey / isSameOrChildPath', () => {
  it('去掉尾斜杠', () => {
    expect(normalizePathKey('/a/b/')).toBe('/a/b');
    expect(normalizePathKey(null)).toBe('');
  });

  it('同一个路径与它的子树都算命中，兄弟不算', () => {
    expect(isSameOrChildPath('/a/b/', '/a/b')).toBe(true);
    expect(isSameOrChildPath('/a/b/c.txt', '/a/b')).toBe(true);
    expect(isSameOrChildPath('/a/bc', '/a/b')).toBe(false);
    expect(isSameOrChildPath('', '/a')).toBe(false);
  });
});

describe('pathBreadcrumbs', () => {
  it('目录段带尾斜杠，最后一段是文件时不带', () => {
    expect(pathBreadcrumbs('/projects/a.md')).toEqual([
      { name: 'projects', path: '/projects/' },
      { name: 'a.md', path: '/projects/a.md' },
    ]);
  });

  it('目录路径把自身也算作一段（点它等于展开该目录）', () => {
    expect(pathBreadcrumbs('/projects/sub/')).toEqual([
      { name: 'projects', path: '/projects/' },
      { name: 'sub', path: '/projects/sub/' },
    ]);
  });

  it('根与空路径没有面包屑', () => {
    expect(pathBreadcrumbs('/')).toEqual([]);
    expect(pathBreadcrumbs('')).toEqual([]);
    expect(pathBreadcrumbs(undefined)).toEqual([]);
  });
});

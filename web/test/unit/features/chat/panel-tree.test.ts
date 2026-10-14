import { describe, expect, it, vi } from 'vitest';

import type { FileEntry } from '@/shared/lib/filesystem-entry';
import {
  applyPrefetchedVisibility,
  buildDisplayName,
  createFilesystemRefreshGate,
  createTreeNode,
  createWorkspaceTreeNode,
  expandedKeysAfterFilesystemRefresh,
  refreshExpandedTree,
  removeTreeNode,
  shouldPollPanelFilesystem,
  sortEntries,
  treeContainsKey,
  treeStateAfterDelete,
  updateTreeChildren,
  type TreeNode,
} from '@/features/chat/lib/panel-tree';

const entry = (path: string, isDir = false, size = 0): FileEntry => ({
  path,
  name: buildDisplayName(path),
  isDir,
  size,
  modifiedAt: '2026-10-12T00:00:00Z',
});

const dir = (path: string) => entry(path, true);

describe('buildDisplayName', () => {
  it('取最后一段，忽略尾斜杠', () => {
    expect(buildDisplayName('/projects/a/b.txt')).toBe('b.txt');
    expect(buildDisplayName('/projects/a/')).toBe('a');
  });

  it('根与空值都显示 /', () => {
    expect(buildDisplayName('/')).toBe('/');
    expect(buildDisplayName('')).toBe('/');
    expect(buildDisplayName(null)).toBe('/');
  });
});

describe('sortEntries', () => {
  it('目录在前，再按名称排', () => {
    const sorted = sortEntries([
      entry('/b.txt'),
      dir('/zeta/'),
      entry('/a.txt'),
      dir('/alpha/'),
    ]);

    expect(sorted.map((item) => item.path)).toEqual([
      '/alpha/',
      '/zeta/',
      '/a.txt',
      '/b.txt',
    ]);
  });

  it('空列表返回空数组', () => {
    expect(sortEntries([])).toEqual([]);
  });
});

describe('createTreeNode', () => {
  it('文件是叶子，目录带空 children', () => {
    expect(createTreeNode(entry('/a/b.txt'))).toMatchObject({
      key: '/a/b.txt',
      title: 'b.txt',
      isLeaf: true,
      children: undefined,
      className: 'file-node',
      fileData: { path: '/a/b.txt', type: 'file', workdir: true },
    });
    expect(createTreeNode(dir('/a/b/'))).toMatchObject({
      key: '/a/b/',
      title: 'b',
      isLeaf: false,
      children: [],
      className: 'folder-node',
      fileData: { type: 'directory' },
    });
  });

  it('长文件名把最后 5 个字符拆成尾段，短名与目录不拆', () => {
    const long = createTreeNode(entry('/a/report-final.md'));
    expect(long.nameStart).toBe('report-fin');
    expect(long.nameEnd).toBe('al.md');

    const short = createTreeNode(entry('/a/a.txt'));
    expect(short.nameStart).toBe('a.txt');
    expect(short.nameEnd).toBe('');

    const folder = createTreeNode(dir('/a/verylongdirectoryname/'));
    expect(folder.nameStart).toBe('verylongdirectoryname');
    expect(folder.nameEnd).toBe('');
  });

  it('个人空间节点带上 workspace 身份，且不是 workdir 文件', () => {
    expect(createWorkspaceTreeNode(entry('/a/b.txt')).fileData).toMatchObject({
      workdir: false,
      workspace: true,
    });
  });
});

describe('updateTreeChildren / removeTreeNode', () => {
  const tree = (): TreeNode[] => [
    {
      ...createTreeNode(dir('/a/')),
      children: [
        { ...createTreeNode(dir('/a/b/')), children: [] },
        createTreeNode(entry('/a/c.txt')),
      ],
    },
    createTreeNode(entry('/d.txt')),
  ];

  it('就地替换目标目录的子项，其它节点不动', () => {
    const next = updateTreeChildren(tree(), '/a/b/', [
      createTreeNode(entry('/a/b/e.txt')),
    ]);

    expect(next[0]?.children?.[0]?.children?.map((node) => node.key)).toEqual([
      '/a/b/e.txt',
    ]);
    expect(next[1]?.key).toBe('/d.txt');
  });

  it('目标不在树里时返回等价的树', () => {
    expect(updateTreeChildren(tree(), '/missing/', [])).toEqual(tree());
  });

  it('移除嵌套节点并保留兄弟', () => {
    const next = removeTreeNode(tree(), '/a/b/');

    expect(next[0]?.children?.map((node) => node.key)).toEqual(['/a/c.txt']);
    expect(next[1]?.key).toBe('/d.txt');
  });

  it('移除顶层节点', () => {
    expect(removeTreeNode(tree(), '/d.txt').map((node) => node.key)).toEqual([
      '/a/',
    ]);
  });

  it('treeContainsKey 认嵌套键', () => {
    expect(treeContainsKey(tree(), '/a/c.txt')).toBe(true);
    expect(treeContainsKey(tree(), '/nope')).toBe(false);
  });
});

describe('refreshExpandedTree', () => {
  const tree = (): TreeNode[] => [
    {
      ...createTreeNode(dir('/a/')),
      children: [{ ...createTreeNode(dir('/a/b/')), children: [] }],
    },
  ];

  it('按层级从浅到深重载，已加载的键跳过', async () => {
    const loadChildren = vi.fn(async (path: string) => [
      createTreeNode(entry(`${path}new.txt`)),
    ]);

    const next = await refreshExpandedTree(
      tree(),
      ['/a/b/', '/a/'],
      loadChildren,
      ['/a/'],
    );

    // /a/ 已经在预取里加载过，只重载 /a/b/
    expect(loadChildren).toHaveBeenCalledTimes(1);
    expect(loadChildren).toHaveBeenCalledWith('/a/b/');
    expect(next[0]?.children?.[0]?.children?.map((node) => node.key)).toEqual([
      '/a/b/new.txt',
    ]);
  });

  it('单个目录读失败时保留上一轮的 children', async () => {
    // 先造一棵「/a/b/ 已有子项」的树：失败后它不该被清空
    const withChildren = updateTreeChildren(tree(), '/a/b/', [
      createTreeNode(entry('/a/b/old.txt')),
    ]);
    const loadChildren = vi.fn(async () => {
      throw new Error('目录瞬时不可读');
    });

    const next = await refreshExpandedTree(
      withChildren,
      ['/a/b/'],
      loadChildren,
    );

    expect(next[0]?.children?.[0]?.children?.map((node) => node.key)).toEqual([
      '/a/b/old.txt',
    ]);
  });

  it('展开键不在树里时跳过', async () => {
    const loadChildren = vi.fn(async () => []);

    await refreshExpandedTree(tree(), ['/missing/'], loadChildren);

    expect(loadChildren).not.toHaveBeenCalled();
  });
});

describe('expandedKeysAfterFilesystemRefresh', () => {
  it('静默刷新保留，非静默清空', () => {
    expect(
      expandedKeysAfterFilesystemRefresh(['/a/'], { silent: true }),
    ).toEqual(['/a/']);
    expect(
      expandedKeysAfterFilesystemRefresh(['/a/'], { silent: false }),
    ).toEqual([]);
  });
});

describe('applyPrefetchedVisibility', () => {
  const nodes = (): TreeNode[] => [
    createTreeNode(dir('/outputs/')),
    createTreeNode(dir('/uploads/')),
    createTreeNode(dir('/other/')),
  ];

  it('空的 outputs / uploads 被隐藏，非关键空目录保留', () => {
    const result = applyPrefetchedVisibility(nodes(), [
      { key: '/outputs/', children: [] },
      { key: '/uploads/', children: [createTreeNode(entry('/uploads/a.txt'))] },
    ]);

    expect(result.nodes.map((node) => node.key)).toEqual([
      '/uploads/',
      '/other/',
    ]);
    expect(result.prefetchedKeys).toEqual(['/outputs/', '/uploads/']);
  });

  it('没预取的目录照常展示，且不进入已加载键', () => {
    const result = applyPrefetchedVisibility(nodes(), [
      { key: '/outputs/', children: null },
    ]);

    expect(result.nodes.map((node) => node.key)).toEqual([
      '/outputs/',
      '/uploads/',
      '/other/',
    ]);
    expect(result.prefetchedKeys).toEqual([]);
  });
});

describe('createFilesystemRefreshGate', () => {
  it('同一线程同时只允许一次在飞，结束时可取到待办', () => {
    const gate = createFilesystemRefreshGate();

    expect(gate.begin('t-1')).toBe(true);
    expect(gate.begin('t-1')).toBe(false);
    // 不带 ensure 的重复请求不攒待办
    expect(gate.finish('t-1')).toBe(false);

    expect(gate.begin('t-1')).toBe(true);
    expect(gate.begin('t-1', { ensure: true })).toBe(false);
    expect(gate.finish('t-1')).toBe(true);
  });

  it('不同线程互不影响', () => {
    const gate = createFilesystemRefreshGate();

    expect(gate.begin('t-1')).toBe(true);
    expect(gate.begin('t-2')).toBe(true);
  });

  it('空线程 id 直接拒绝', () => {
    const gate = createFilesystemRefreshGate();

    expect(gate.begin('')).toBe(false);
  });

  it('只在请求线程仍是当前线程时允许提交', () => {
    const gate = createFilesystemRefreshGate();

    expect(gate.canCommit('t-1', 't-1')).toBe(true);
    expect(gate.canCommit('t-1', 't-2')).toBe(false);
    expect(gate.canCommit('', '')).toBe(false);
  });
});

describe('shouldPollPanelFilesystem', () => {
  const base = {
    panelOpen: true,
    pageVisible: true,
    streaming: true,
    activeSection: {
      key: 'file-tree',
      type: 'file-tree' as const,
      title: '文件',
    },
    activePreview: null,
  };

  it('三个前提缺一不可', () => {
    expect(shouldPollPanelFilesystem(base)).toBe(true);
    expect(shouldPollPanelFilesystem({ ...base, panelOpen: false })).toBe(
      false,
    );
    expect(shouldPollPanelFilesystem({ ...base, pageVisible: false })).toBe(
      false,
    );
    expect(shouldPollPanelFilesystem({ ...base, streaming: false })).toBe(
      false,
    );
  });

  it('文件预览只在预览对话目录里的文件时轮询', () => {
    const fileSection = {
      key: 'file',
      type: 'file' as const,
      title: '文件',
      path: '/a.txt',
    };

    expect(
      shouldPollPanelFilesystem({
        ...base,
        activeSection: fileSection,
        activePreview: { workdir: true },
      }),
    ).toBe(true);
    // 个人空间的文件不随生成变化
    expect(
      shouldPollPanelFilesystem({
        ...base,
        activeSection: fileSection,
        activePreview: { workdir: false },
      }),
    ).toBe(false);
  });

  it('调试分区不轮询', () => {
    expect(
      shouldPollPanelFilesystem({
        ...base,
        activeSection: {
          key: 'message-debug',
          type: 'message-debug',
          title: '调试',
        },
      }),
    ).toBe(false);
  });
});

describe('treeStateAfterDelete', () => {
  it('清掉被删路径及其子树的选中与展开，并交出要关闭的预览', () => {
    const result = treeStateAfterDelete(
      ['/a/b/c.txt', '/d.txt'],
      ['/a/', '/a/b/', '/x/'],
      '/a/b/',
    );

    expect(result.selectedKeys).toEqual(['/d.txt']);
    expect(result.expandedKeys).toEqual(['/a/', '/x/']);
    expect(result.closedPreviewPath).toBe('/a/b/');
  });
});

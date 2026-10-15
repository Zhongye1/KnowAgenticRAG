import { describe, expect, it } from 'vitest';

import {
  buildSearchHitLocation,
  openLocation,
  UNKNOWN_DIR_CRUMB,
} from '@/features/knowledge-base';

describe('搜索命中的定位', () => {
  it('路径投影的文件按目录前缀定位，面包屑是真实目录名', () => {
    expect(
      buildSearchHitLocation({
        filename: 'brief/docs/年度报表.pdf',
        parent_id: null,
      }),
    ).toEqual({
      parentId: null,
      pathPrefix: 'brief/docs/',
      crumbs: [
        { fileId: null, pathPrefix: 'brief/', filename: 'brief' },
        { fileId: null, pathPrefix: 'brief/docs/', filename: 'docs' },
      ],
    });
  });

  it('路径投影挂在实体目录下时保留 parent_id，并补一节占位父目录', () => {
    // 后端 filename 与 parent_id 是两个独立字段：路径投影只说明目录部分，
    // 文件仍可能在实体目录里，丢掉 parent_id 会查到空目录
    expect(
      buildSearchHitLocation({
        filename: 'brief/a.md',
        parent_id: 'folder-9',
      }),
    ).toEqual({
      parentId: 'folder-9',
      pathPrefix: 'brief/',
      crumbs: [
        { fileId: 'folder-9', pathPrefix: '', filename: UNKNOWN_DIR_CRUMB },
        { fileId: 'folder-9', pathPrefix: 'brief/', filename: 'brief' },
      ],
    });
  });

  it('路径投影用的父目录 id 让点面包屑停在同一父目录内', () => {
    const location = buildSearchHitLocation({
      filename: 'brief/docs/a.md',
      parent_id: 'folder-9',
    });
    // 点「brief」这一节：父目录不变，前缀收到 brief/
    expect(location.crumbs[1]).toEqual({
      fileId: 'folder-9',
      pathPrefix: 'brief/',
      filename: 'brief',
    });
    expect(location.pathPrefix).toBe('brief/docs/');
  });

  it('只有 parent_id 时用占位节，点它仍停在同一层', () => {
    expect(
      buildSearchHitLocation({
        filename: '年度报表.pdf',
        parent_id: 'folder-9',
      }),
    ).toEqual({
      parentId: 'folder-9',
      pathPrefix: '',
      crumbs: [
        { fileId: 'folder-9', pathPrefix: '', filename: UNKNOWN_DIR_CRUMB },
      ],
    });
  });

  it('根目录的文件回到根，不加面包屑', () => {
    expect(
      buildSearchHitLocation({ filename: '年度报表.pdf', parent_id: null }),
    ).toEqual({ parentId: null, pathPrefix: '', crumbs: [] });
  });

  it('目录名末尾的分隔符不会拼出空的一节', () => {
    const location = buildSearchHitLocation({
      filename: 'brief/a.md',
      parent_id: null,
    });
    expect(location.crumbs).toHaveLength(1);
    expect(location.pathPrefix).toBe('brief/');
  });
});

describe('打开一个位置', () => {
  it('把状态筛选与页码一起归位', () => {
    expect(
      openLocation({ parentId: 'folder-9', pathPrefix: '', crumbs: [] }),
    ).toEqual({
      location: { parentId: 'folder-9', pathPrefix: '', crumbs: [] },
      status: 'all',
      page: 1,
    });
  });
});

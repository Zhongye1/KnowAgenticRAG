import { describe, expect, it } from 'vitest';

import {
  canDragKnowledgeFile,
  canDropKnowledgeFileIntoFolder,
  canMutateKnowledgeFiles,
} from '@/features/knowledge-base/lib/knowledge-files';

const folder = (id: string, extra: Record<string, unknown> = {}) => ({
  file_id: id,
  is_folder: true,
  ...extra,
});
const doc = (id: string, extra: Record<string, unknown> = {}) => ({
  file_id: id,
  is_folder: false,
  ...extra,
});

describe('拖拽移动的能力判定', () => {
  it('只读、有操作在飞行、跨目录筛选、虚拟层四种情况都不许改文件区', () => {
    // 变异：去掉任一条后，对应场景会出现拖得动但后端不接受的操作
    const base = {
      readOnly: false,
      locked: false,
      filtered: false,
      virtualPath: false,
    };
    expect(canMutateKnowledgeFiles(base)).toBe(true);
    expect(canMutateKnowledgeFiles({ ...base, readOnly: true })).toBe(false);
    expect(canMutateKnowledgeFiles({ ...base, locked: true })).toBe(false);
    expect(canMutateKnowledgeFiles({ ...base, filtered: true })).toBe(false);
    expect(canMutateKnowledgeFiles({ ...base, virtualPath: true })).toBe(false);
  });

  it('虚拟目录不可拖，普通文件在存在落点时可拖', () => {
    expect(
      canDragKnowledgeFile({
        enabled: true,
        file: { file_id: 'v-1', is_folder: true, is_virtual_folder: true },
        crumbs: [{ fileId: 'f-1' }],
        files: [],
      }),
    ).toBe(false);

    expect(
      canDragKnowledgeFile({
        enabled: true,
        file: doc('a-1'),
        crumbs: [{ fileId: 'f-1' }],
        files: [],
      }),
    ).toBe(true);
  });

  it('没有可落点的文件不可拖：根目录且同层没有实体目录时', () => {
    // 根目录的面包屑为空，同层只有文件与虚拟目录 → 拖了没地方放
    expect(
      canDragKnowledgeFile({
        enabled: true,
        file: doc('a-1'),
        crumbs: [],
        files: [doc('a-2'), { file_id: 'v-1', is_folder: true, is_virtual_folder: true }],
      }),
    ).toBe(false);

    // 同层有实体目录就可拖
    expect(
      canDragKnowledgeFile({
        enabled: true,
        file: doc('a-1'),
        crumbs: [],
        files: [folder('f-1')],
      }),
    ).toBe(true);
  });

  it('不在根目录时根目录就是一个落点；在根目录且同层没有实体目录时才不可拖', () => {
    // 参照把根作为面包屑第一节，因此「在某个目录里」本身就提供了根这个落点；
    // 本仓面包屑不含根，用「面包屑非空」表达同一件事
    expect(
      canDragKnowledgeFile({
        enabled: true,
        file: doc('a-1'),
        crumbs: [{ fileId: null }, { fileId: 'f-current' }],
        files: [],
      }),
    ).toBe(true);
    // 在根目录：面包屑为空，同层又没有实体目录 → 无处可放
    expect(
      canDragKnowledgeFile({
        enabled: true,
        file: doc('a-1'),
        crumbs: [],
        files: [doc('a-2')],
      }),
    ).toBe(false);
  });

  it('落点必须是实体文件夹，虚拟目录与自身都不是', () => {
    expect(canDropKnowledgeFileIntoFolder(doc('a-1'), folder('f-1'))).toBe(true);
    expect(canDropKnowledgeFileIntoFolder(doc('a-1'), doc('a-2'))).toBe(false);
    expect(
      canDropKnowledgeFileIntoFolder(doc('a-1'), {
        file_id: 'f-1',
        is_folder: true,
        is_virtual_folder: true,
      }),
    ).toBe(false);
    // 自己拖到自己身上不算
    expect(
      canDropKnowledgeFileIntoFolder(folder('f-1'), folder('f-1')),
    ).toBe(false);
    // 没有正在拖的东西时任何目标都不是落点
    expect(canDropKnowledgeFileIntoFolder(null, folder('f-1'))).toBe(false);
  });
});

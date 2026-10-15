import { describe, expect, it } from 'vitest';

import {
  readSidebarCollapsed,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  writeSidebarCollapsed,
  type SidebarPreferenceStorage,
} from '@/widgets/app-sidebar/lib/sidebar-preference';

/** 内存存储桩；`throwOnWrite` 用于覆盖隐私模式这类写入失败。 */
const createStorage = (
  initial: Record<string, string> = {},
  options: { throwOnRead?: boolean; throwOnWrite?: boolean } = {},
): SidebarPreferenceStorage & { data: Record<string, string> } => {
  const data = { ...initial };

  return {
    data,
    getItem(key) {
      if (options.throwOnRead) throw new Error('storage unavailable');
      return key in data ? data[key] : null;
    },
    setItem(key, value) {
      if (options.throwOnWrite) throw new Error('storage unavailable');
      data[key] = value;
    },
  };
};

describe('readSidebarCollapsed', () => {
  it('读出持久化的两个字面量', () => {
    expect(
      readSidebarCollapsed(
        createStorage({ [SIDEBAR_COLLAPSED_STORAGE_KEY]: 'true' }),
      ),
    ).toBe(true);
    expect(
      readSidebarCollapsed(
        createStorage({ [SIDEBAR_COLLAPSED_STORAGE_KEY]: 'false' }),
      ),
    ).toBe(false);
  });

  it('没有写入过时返回 null，由调用方决定默认值', () => {
    expect(readSidebarCollapsed(createStorage())).toBeNull();
  });

  it('值损坏时返回 null，不把损坏值当成折叠', () => {
    expect(
      readSidebarCollapsed(
        createStorage({ [SIDEBAR_COLLAPSED_STORAGE_KEY]: '1' }),
      ),
    ).toBeNull();
    expect(
      readSidebarCollapsed(
        createStorage({
          [SIDEBAR_COLLAPSED_STORAGE_KEY]: '{"sidebarCollapsed":true}',
        }),
      ),
    ).toBeNull();
  });

  it('读取抛错时返回 null，不让存储故障冒泡到渲染', () => {
    expect(
      readSidebarCollapsed(createStorage({}, { throwOnRead: true })),
    ).toBeNull();
  });
});

describe('writeSidebarCollapsed', () => {
  it('写入后能读回同一个值', () => {
    const storage = createStorage();

    expect(writeSidebarCollapsed(true, storage)).toBe(true);
    expect(storage.data[SIDEBAR_COLLAPSED_STORAGE_KEY]).toBe('true');
    expect(readSidebarCollapsed(storage)).toBe(true);
  });

  it('写入抛错时返回 false，且不改变已存的值', () => {
    const storage = createStorage(
      { [SIDEBAR_COLLAPSED_STORAGE_KEY]: 'false' },
      { throwOnWrite: true },
    );

    expect(writeSidebarCollapsed(true, storage)).toBe(false);
    expect(storage.data[SIDEBAR_COLLAPSED_STORAGE_KEY]).toBe('false');
  });

  it('存储不可用时返回 false，不抛错', () => {
    expect(writeSidebarCollapsed(true, null)).toBe(false);
    expect(readSidebarCollapsed(null)).toBeNull();
  });
});

describe('默认存储解析', () => {
  it('不传存储时读写 window.localStorage', () => {
    window.localStorage.clear();

    expect(readSidebarCollapsed()).toBeNull();
    expect(writeSidebarCollapsed(true)).toBe(true);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe(
      'true',
    );
    expect(readSidebarCollapsed()).toBe(true);

    window.localStorage.clear();
  });
});

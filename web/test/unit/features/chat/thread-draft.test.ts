import { describe, expect, it } from 'vitest';

import {
  DRAFT_THREAD_ID,
  createThreadDraftSession,
  createThreadDraftStore,
  type ThreadDraftStorage,
} from '@/features/chat/lib/thread-draft';

/** 内存存储：既能断言写入结果，也能模拟 localStorage 抛错。 */
const createStorage = (options: { failOn?: 'get' | 'set' | 'remove' } = {}) => {
  const entries = new Map<string, string>();
  const storage: ThreadDraftStorage = {
    getItem: (key) => {
      if (options.failOn === 'get') throw new Error('storage disabled');
      return entries.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (options.failOn === 'set') throw new Error('quota exceeded');
      entries.set(key, value);
    },
    removeItem: (key) => {
      if (options.failOn === 'remove') throw new Error('storage disabled');
      entries.delete(key);
    },
  };
  return { storage, entries };
};

describe('线程草稿存储', () => {
  it('没有草稿时读到空串', () => {
    const { storage } = createStorage();
    const store = createThreadDraftStore(storage);

    expect(store.read('thread-A')).toBe('');
  });

  it('写入后按线程隔离读取', () => {
    const { storage } = createStorage();
    const store = createThreadDraftStore(storage);

    store.write('thread-A', '甲');
    store.write('thread-B', '乙');

    expect(store.read('thread-A')).toBe('甲');
    expect(store.read('thread-B')).toBe('乙');
  });

  it('写入空串等于清除，不留下无效条目', () => {
    const { storage, entries } = createStorage();
    const store = createThreadDraftStore(storage);

    store.write('thread-A', '甲');
    expect(entries.size).toBe(1);

    store.write('thread-A', '');
    expect(entries.size).toBe(0);
    expect(store.read('thread-A')).toBe('');
  });

  it('清除只影响指定的线程', () => {
    const { storage } = createStorage();
    const store = createThreadDraftStore(storage);
    store.write('thread-A', '甲');
    store.write('thread-B', '乙');

    store.write('thread-A', '');

    expect(store.read('thread-A')).toBe('');
    expect(store.read('thread-B')).toBe('乙');
  });

  it('存储抛错时读取降级为空串，写入与清除都不抛出', () => {
    const read = createThreadDraftStore(
      createStorage({ failOn: 'get' }).storage,
    );
    const write = createThreadDraftStore(
      createStorage({ failOn: 'set' }).storage,
    );
    const clear = createThreadDraftStore(
      createStorage({ failOn: 'remove' }).storage,
    );

    expect(read.read('thread-A')).toBe('');
    expect(() => write.write('thread-A', '甲')).not.toThrow();
    expect(() => clear.write('thread-A', '')).not.toThrow();
  });

  it('拿不到 localStorage 时退化为无草稿而不是崩溃', () => {
    const store = createThreadDraftStore(null);

    expect(store.read('thread-A')).toBe('');
    expect(() => store.write('thread-A', '甲')).not.toThrow();
  });
});

describe('线程草稿会话', () => {
  it('saveInput 写在当前线程的草稿键上', () => {
    const { storage, entries } = createStorage();
    const session = createThreadDraftSession(
      createThreadDraftStore(storage),
      'thread-A',
    );

    session.saveInput('写到 A');

    expect(entries.get('ars:thread-input-draft:thread-A')).toBe('写到 A');
  });

  it('切线程先把当前文本存回旧线程，再返回新线程的草稿', () => {
    const { storage } = createStorage();
    const store = createThreadDraftStore(storage);
    const session = createThreadDraftSession(store, 'thread-A');
    store.write('thread-B', 'B 早就有的草稿');

    expect(session.switchThread('thread-B', 'A 的未发送内容')).toBe(
      'B 早就有的草稿',
    );
    expect(store.read('thread-A')).toBe('A 的未发送内容');
  });

  it('切走再切回来能还原原来的草稿', () => {
    const { storage } = createStorage();
    const store = createThreadDraftStore(storage);
    const session = createThreadDraftSession(store, 'thread-A');

    expect(session.switchThread('thread-B', '还没发出去')).toBe('');
    expect(session.switchThread('thread-A', '')).toBe('还没发出去');
  });

  it('没有线程时草稿落在临时键上', () => {
    const { storage, entries } = createStorage();
    const session = createThreadDraftSession(
      createThreadDraftStore(storage),
      '',
    );

    session.saveInput('新建对话的内容');

    expect(entries.get(`ars:thread-input-draft:${DRAFT_THREAD_ID}`)).toBe(
      '新建对话的内容',
    );
  });

  it('切到没有线程的地址时读到临时键的草稿', () => {
    const { storage } = createStorage();
    const store = createThreadDraftStore(storage);
    const session = createThreadDraftSession(store, 'thread-A');
    store.write(DRAFT_THREAD_ID, '临时草稿');

    expect(session.switchThread(null, '')).toBe('临时草稿');
  });

  it('不含临时键写回：从新建对话切进线程后再切回，临时草稿仍在', () => {
    const { storage } = createStorage();
    const store = createThreadDraftStore(storage);
    const session = createThreadDraftSession(store, '');

    // 在 /agent 写了没发的文本，切进已有线程时文本归该线程所有，临时键保持原样
    session.saveInput('新建对话的内容');
    expect(session.switchThread('thread-A', '新建对话的内容')).toBe('');

    session.saveInput('A 的内容');
    expect(session.switchThread(null, 'A 的内容')).toBe('新建对话的内容');
  });
});

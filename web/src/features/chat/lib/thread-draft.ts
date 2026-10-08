/**
 * 对话输入框草稿的本地存储与线程切换。
 *
 * 逐行移植上游 `utils/thread_draft.js`：草稿按线程 ID 存进 localStorage，刷新后仍可还原；
 * 新建但还没取得线程 ID 的对话用 `DRAFT_THREAD_ID` 作临时键。空文本直接清键。
 * 存储写入失败（隐私模式、配额满、localStorage 不可用）时草稿只在当前线程的输入框里
 * 有效：切换线程要读新键，读不到就把输入清空，不做内存兜底。
 */

/** 新建对话尚未取得线程 ID 时使用的草稿键。 */
export const DRAFT_THREAD_ID = '__draft__';

/** 草稿键前缀；与上游同结构，前缀本仓化以免与上游站点互相污染。 */
const STORAGE_KEY_PREFIX = 'ars:thread-input-draft:';

/** 草稿用的最小存储形状；默认取 `window.localStorage`。 */
export interface ThreadDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const resolveStorage = (
  storage?: ThreadDraftStorage | null,
): ThreadDraftStorage | null =>
  storage || (typeof window !== 'undefined' ? window.localStorage : null);

/** 线程草稿存储；两个方法都不抛错。 */
export interface ThreadDraftStore {
  read(threadId: string): string;
  write(threadId: string, text: string): void;
}

/** 创建基于 localStorage 的线程草稿存储。 */
export const createThreadDraftStore = (
  storage?: ThreadDraftStorage | null,
): ThreadDraftStore => {
  const targetStorage = resolveStorage(storage);
  const keyOf = (threadId: string) => `${STORAGE_KEY_PREFIX}${threadId}`;

  return {
    read(threadId) {
      if (!targetStorage) return '';
      try {
        return targetStorage.getItem(keyOf(threadId)) || '';
      } catch {
        return '';
      }
    },
    write(threadId, text) {
      if (!targetStorage) return;
      try {
        // 空草稿直接清除，避免无效条目持续累积
        if (text) {
          targetStorage.setItem(keyOf(threadId), text);
        } else {
          targetStorage.removeItem(keyOf(threadId));
        }
      } catch {
        // 隐私模式或配额满时写入失败，这一条草稿只在输入框里存活
      }
    },
  };
};

/**
 * 上游 store 还有一个 `remove()`：删除会话时清掉该线程的草稿键。
 * 本仓不接：删除发生在会话列表切片，接入要把草稿实例提升为跨组件共享，而残留键只挂在
 * 已删除的线程 ID 上、读不到任何在用线程。代价是删除当前会话时，输入框里未发送的文本会
 * 被写进那个键并不再展示——与上游删掉草稿键的用户可见结果一致。
 */

/** 绑定当前输入框的草稿会话。 */
export interface ThreadDraftSession {
  saveInput(text: string): void;
  switchThread(
    threadId: string | null | undefined,
    currentText: string,
  ): string;
}

/**
 * 创建绑定当前输入框的草稿会话，负责草稿与线程的对应关系。
 *
 * 内部持有当前草稿归属的键，保证输入内容始终写入切换前的线程，
 * 不受 React 渲染与 effect 时序影响。
 *
 * 上游还有一个 `clearDraftThread()`，用来在「由临时草稿建出线程」后清掉临时键。
 * 本仓不需要：清空输入必然经过 `saveInput('')`，而它与 `navigate()` 同处一个同步块，
 * effect 只能在提交后运行，因此清空时 draftKey 仍指向临时键，写空串即删除。
 * 上游另一处调用点在附件上传建线程的流程里，本仓还没有对应 consumer。
 */
export const createThreadDraftSession = (
  store: ThreadDraftStore,
  initialThreadId: string | null | undefined = '',
): ThreadDraftSession => {
  let draftKey = initialThreadId || DRAFT_THREAD_ID;

  return {
    // 输入变化时实时保存当前线程的草稿
    saveInput(text) {
      store.write(draftKey, text);
    },
    // 切换线程：先保存旧线程草稿，再返回新线程（或新建对话）的草稿
    switchThread(threadId, currentText) {
      store.write(draftKey, currentText);
      draftKey = threadId || DRAFT_THREAD_ID;
      return store.read(draftKey);
    },
  };
};

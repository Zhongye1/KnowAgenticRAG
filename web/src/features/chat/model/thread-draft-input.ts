/**
 * 对话输入草稿的状态层。
 *
 * 按线程落盘的未发送输入：store/session 的纯逻辑在 `lib/thread-draft.ts`，这里持有
 * 「输入框权威值 + 同步 ref」（切线程的 effect 必须读「此刻」的输入，不能依赖 state）
 * 与切线程回写动作。页面只消费 `input` / `updateInput` / `currentInput` / `switchThread`。
 */
import * as React from 'react';

import {
  DRAFT_THREAD_ID,
  createThreadDraftSession,
  createThreadDraftStore,
} from '../lib/thread-draft';

export type ThreadDraftInput = {
  /** 输入框当前值（渲染用）。 */
  input: string;
  /** 「此刻」的输入值；异步流程（发送、steer 还原）读这个而不是 state。 */
  currentInput: () => string;
  /** 输入变化：先同步 ref 与草稿，再更新 state。 */
  updateInput: (value: string) => void;
  /** 切线程：先把当前文本写回旧线程，再取新线程的草稿。 */
  switchThread: (threadId: string | null | undefined) => void;
};

export const useThreadDraftInput = (
  initialThreadId: string | null | undefined,
): ThreadDraftInput => {
  // 草稿会话持有「当前输入属于哪条线程」，因此只创建一次，不能随渲染重建
  const [draft] = React.useState(() => {
    const store = createThreadDraftStore();
    return { store, session: createThreadDraftSession(store, initialThreadId) };
  });
  const [input, setInputState] = React.useState(() =>
    draft.store.read(initialThreadId || DRAFT_THREAD_ID),
  );
  // 输入框的权威值：切线程的 effect 要读「此刻」的输入。不能把 `input` 放进
  // effect 依赖（每敲一个字都会重跑切线程），也不能用 setState 的 updater 读当前值
  // （StrictMode 会双调用 updater，第一次已把 draftKey 换成新线程，第二次就把旧线程
  // 的文本写进新线程的草稿键），所以由 ref 同步持有。
  const inputRef = React.useRef(input);

  const updateInput = React.useCallback(
    (value: string) => {
      inputRef.current = value;
      draft.session.saveInput(value);
      setInputState(value);
    },
    [draft],
  );

  const currentInput = React.useCallback(() => inputRef.current, []);

  const switchThread = React.useCallback(
    (threadId: string | null | undefined) => {
      // 切线程（含从 /agent 进入新线程）时先把当前文本写回旧线程，再取新线程的草稿；
      // 待发送的图片不跟线程走：留在输入框里会发给另一条线程
      const next = draft.session.switchThread(threadId, inputRef.current);
      inputRef.current = next;
      setInputState(next);
    },
    [draft],
  );

  return { input, currentInput, updateInput, switchThread };
};

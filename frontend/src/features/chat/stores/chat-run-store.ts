import { create } from 'zustand';

import type { ChatCitation, ChatMeta, ChatRunInfo, ChatUsage } from '../types';

/** 最多保留的运行期信息条数（防止长会话内存无界增长） */
const MAX_RUNS = 100;

interface ChatRunState {
  runs: Record<string, ChatRunInfo>;
  setMeta: (messageId: string, meta?: ChatMeta) => void;
  setCitations: (messageId: string, citations?: ChatCitation[]) => void;
  setUsage: (messageId: string, usage?: ChatUsage) => void;
  setDone: (messageId: string, reason?: string) => void;
}

const trimRuns = (
  runs: Record<string, ChatRunInfo>,
): Record<string, ChatRunInfo> => {
  const keys = Object.keys(runs);
  if (keys.length <= MAX_RUNS) return runs;
  const next = { ...runs };
  for (const key of keys.slice(0, keys.length - MAX_RUNS)) {
    delete next[key];
  }
  return next;
};

const updateRun = (
  state: { runs: Record<string, ChatRunInfo> },
  messageId: string,
  patch: Partial<ChatRunInfo>,
): Record<string, ChatRunInfo> =>
  trimRuns({ ...state.runs, [messageId]: { ...state.runs[messageId], ...patch } });

export const useChatRunStore = create<ChatRunState>()((set) => ({
  runs: {},
  setMeta: (messageId, meta) =>
    set((state) => ({ runs: updateRun(state, messageId, { meta }) })),
  setCitations: (messageId, citations = []) =>
    set((state) => ({ runs: updateRun(state, messageId, { citations }) })),
  setUsage: (messageId, usage) =>
    set((state) => ({ runs: updateRun(state, messageId, { usage }) })),
  setDone: (messageId, reason) =>
    set((state) => ({ runs: updateRun(state, messageId, { doneReason: reason }) })),
}));

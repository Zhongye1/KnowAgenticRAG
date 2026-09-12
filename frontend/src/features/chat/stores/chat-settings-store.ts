import { create } from 'zustand';

import type { ChatMode } from '../types';

/** 当前问答目标知识库（localStorage 持久化，刷新后保留选择） */
const STORAGE_KEY = 'ragf-chat-kb';
/** 当前问答模式（localStorage 持久化，刷新后保留选择） */
const MODE_STORAGE_KEY = 'ragf-chat-mode';

const readStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const readInitialKbName = (): string | null => readStorage(STORAGE_KEY);

const readInitialMode = (): ChatMode =>
  readStorage(MODE_STORAGE_KEY) === 'agent' ? 'agent' : 'chat';

interface ChatSettingsState {
  kbName: string | null;
  /** chat = 固定检索一次生成；agent = 服务端图编排（规划 + 工具检索 + 自省改写） */
  mode: ChatMode;
  setKbName: (kbName: string | null) => void;
  setMode: (mode: ChatMode) => void;
}

const writeStorage = (key: string, value: string | null): void => {
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // 私有模式等存储异常不阻断交互
  }
};

export const useChatSettingsStore = create<ChatSettingsState>()((set) => ({
  kbName: readInitialKbName(),
  mode: readInitialMode(),
  setKbName: (kbName) => {
    writeStorage(STORAGE_KEY, kbName);
    set({ kbName });
  },
  setMode: (mode) => {
    writeStorage(MODE_STORAGE_KEY, mode);
    set({ mode });
  },
}));

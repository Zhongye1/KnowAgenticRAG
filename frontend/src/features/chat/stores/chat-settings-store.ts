import { create } from 'zustand';

/** 当前问答目标知识库（localStorage 持久化，刷新后保留选择） */
const STORAGE_KEY = 'ragf-chat-kb';

const readInitialKbName = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

interface ChatSettingsState {
  kbName: string | null;
  setKbName: (kbName: string | null) => void;
}

export const useChatSettingsStore = create<ChatSettingsState>()((set) => ({
  kbName: readInitialKbName(),
  setKbName: (kbName) => {
    try {
      if (kbName) {
        window.localStorage.setItem(STORAGE_KEY, kbName);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // 私有模式等存储异常不阻断交互
    }
    set({ kbName });
  },
}));

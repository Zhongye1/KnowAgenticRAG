/**
 * 调试面板的开关状态。
 *
 * 面板由外壳挂载一次，用户菜单的入口与全局快捷键共享同一个开关；各自持有状态会让
 * 快捷键打开的面板在菜单里读不到，反之亦然。
 */
import { create } from 'zustand';

type DebugPanelState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useDebugPanel = create<DebugPanelState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}));

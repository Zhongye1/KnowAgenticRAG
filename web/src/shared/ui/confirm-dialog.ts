/**
 * 命令式确认框。
 *
 * 对应上游 19 个文件里的 26 处 `Modal.confirm`：调用点只关心「用户确认了没有」，
 * 不持有弹窗状态。用法：
 *
 * ```ts
 * if (!(await confirm({ title: '删除知识库', destructive: true }))) return;
 * ```
 *
 * 弹窗本体由 `ConfirmDialogHost` 渲染一次（挂在外壳里）；一个时刻只处理一个请求，
 * 新的请求会让上一个以 `false` 结束，避免 Promise 悬空。
 */
import { create } from 'zustand';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作：确认按钮用危险色。 */
  destructive?: boolean;
};

type PendingConfirm = {
  options: Required<Pick<ConfirmOptions, 'confirmText' | 'cancelText'>> &
    ConfirmOptions;
  resolve: (confirmed: boolean) => void;
};

type ConfirmStore = {
  pending: PendingConfirm | null;
  request: (options: ConfirmOptions) => Promise<boolean>;
  settle: (confirmed: boolean) => void;
};

const DEFAULTS = { confirmText: '确定', cancelText: '取消' };

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  pending: null,
  request: (options) => {
    // 上一个请求没人回答就被顶掉了：显式以 false 结束，不留悬空 Promise
    get().pending?.resolve(false);
    return new Promise<boolean>((resolve) => {
      set({
        pending: {
          options: { ...DEFAULTS, ...options },
          resolve,
        },
      });
    });
  },
  settle: (confirmed) => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null });
    pending.resolve(confirmed);
  },
}));

/** 打开确认框并等待用户选择；确认返回 true，取消或关闭返回 false。 */
export const confirm = (options: ConfirmOptions): Promise<boolean> =>
  useConfirmStore.getState().request(options);

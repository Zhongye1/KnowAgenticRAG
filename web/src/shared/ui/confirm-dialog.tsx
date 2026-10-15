/**
 * 命令式确认框。
 *
 * 调用点只关心「用户确认了没有」，不持有弹窗状态。用法：
 *
 * ```ts
 * if (!(await confirm({ title: '删除知识库', destructive: true }))) return;
 * ```
 *
 * 实现是 antd `App.useApp()` 的 `modal.confirm`（5.29 起 `.then()` 以 silent 模式
 * resolve boolean：确认 true、取消/关闭 false），组件形态由 antd 拥有；
 * `ConfirmDialogHost` 不再需要。
 */
import { App as AntdApp } from 'antd';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作：确认按钮用危险色。 */
  destructive?: boolean;
};

export type ConfirmApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

/** 取命令式确认框句柄；必须在 `AntdApp` 上下文内调用（应用外壳已装配）。 */
export const useConfirm = (): ConfirmApi => {
  const { modal } = AntdApp.useApp();

  return {
    confirm: ({ title, description, confirmText, cancelText, destructive }) =>
      modal
        .confirm({
          title,
          content: description,
          okText: confirmText ?? '确定',
          cancelText: cancelText ?? '取消',
          okButtonProps: destructive ? { danger: true } : undefined,
        })
        // antd 的 then 形态要求两个参数；reject 分支不会走（内部只 resolve）
        .then(
          (confirmed: boolean) => confirmed === true,
          () => false,
        ),
  };
};

/**
 * 对话页的 antd 弹窗适配。
 *
 * shared/ui/dialog 是 Radix 的复合组件（Dialog/Content/Header/Title/Description/
 * Footer），antd Modal 的词汇是单个组件加 props。本适配保留复合形态——调用方的
 * JSX 结构不变，由适配层把各段映射到 Modal 的 title/footer 与 children。
 *
 * 迁移期五个调用方改 import 即可；B6 收口后调用方直接用 antd。
 */
import * as React from 'react';
import { Modal as AntdModal } from 'antd';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

const DialogCloseContext = React.createContext<{ close: () => void } | null>(
  null,
);

export const Dialog = ({ open, onOpenChange, children }: DialogProps) => (
  <DialogCloseContext.Provider value={{ close: () => onOpenChange(false) }}>
    <AntdModal
      open={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      destroyOnHidden
      width={520}
    >
      {children}
    </AntdModal>
  </DialogCloseContext.Provider>
);

export const DialogContent = ({
  children,
  className,
  onKeyDown,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) => {
  // Radix 的 DialogContent 自带两个行为，antd Modal 都要补：
  // 1. 挂载时把焦点落到弹层内第一个可聚焦元素；
  // 2. Esc 触发 onOpenChange(false)（不依赖焦点位置）。
  const context = React.useContext(DialogCloseContext);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const focusFirstInput = (node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (!node) return;
    const first = node.querySelector<HTMLElement>('input, textarea');
    // antd 的弹层经 portal 挂载，挂载完成可能晚于首帧；下一轮宏任务再聚焦
    // （jsdom 没有 requestAnimationFrame，setTimeout 是两端都可用的兜底）
    window.setTimeout(() => first?.focus(), 0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation();
      context?.close();
    }
    onKeyDown?.(event);
  };

  return (
    <div
      ref={focusFirstInput}
      className={className}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
};

export const DialogHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-3">{children}</div>
);

export const DialogTitle = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <h2 className={`m-0 text-base font-semibold text-[var(--gray-1000)] ${className ?? ''}`}>
    {children}
  </h2>
);

export const DialogDescription = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <p className={`mb-0 mt-1 text-xs text-[var(--gray-500)] ${className ?? ''}`}>{children}</p>
);

export const DialogFooter = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-4 flex justify-end gap-2">{children}</div>
);

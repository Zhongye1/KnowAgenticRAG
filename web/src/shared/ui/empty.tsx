/**
 * 空态。
 *
 * 对应上游遍布各页的 `a-empty`：图标 + 说明 + 可选的下一步动作。
 * 上游某些位置只给 `:description`，这里对应 `description`；需要引导用户继续操作时
 * 传 `action`（例如「新建知识库」「上传文件」），不要只留一句“暂无数据”。
 */
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

import { cn } from '@/shared/lib';

type EmptyProps = {
  /** 一句说明当前为什么是空的。 */
  description?: string;
  /** 进一步引导：按钮或链接。 */
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
};

export const Empty = ({
  description = '暂无数据。',
  action,
  icon: Icon = Inbox,
  className,
}: EmptyProps) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center gap-3 px-4 py-10 text-center',
      className,
    )}
    data-testid="empty-state"
  >
    <Icon className="size-8 text-color-text-4" aria-hidden />
    <p className="text-sm text-color-text-3">{description}</p>
    {action}
  </div>
);

/**
 * 逐项进度列表。
 *
 * 四种状态（等待 / 处理中 / 完成 / 失败）各有图标与文案，失败项把后端原因显示在行内。
 */
import { CheckCircle2, Circle, LoaderCircle, XCircle } from 'lucide-react';

import type { InstallStatus } from '../lib/install-flow';
import { cn } from '@/shared/lib';

export const INSTALL_STATUS_LABELS: Record<InstallStatus, string> = {
  waiting: '等待',
  active: '处理中',
  success: '完成',
  failed: '失败',
};

export type InstallStatusItem = {
  key: string;
  name: string;
  description?: string;
  slug: string;
  error?: string;
  status: InstallStatus;
};

const ICONS = {
  waiting: Circle,
  active: LoaderCircle,
  success: CheckCircle2,
  failed: XCircle,
} as const;

export const InstallStatusList = ({
  items,
}: {
  items: InstallStatusItem[];
}) => (
  <ul className="flex flex-col gap-1" data-testid="install-status-list">
    {items.map((item) => {
      const Icon = ICONS[item.status];
      return (
        <li
          key={item.key}
          data-status={item.status}
          className={cn(
            'flex items-center gap-2 rounded-small border border-color-border-1 px-3 py-2',
            item.status === 'failed'
              ? 'border-danger-3 bg-danger-1'
              : undefined,
          )}
        >
          <Icon
            className={cn(
              'size-4 shrink-0',
              item.status === 'active' ? 'animate-spin' : undefined,
              item.status === 'success' ? 'text-success-6' : undefined,
              item.status === 'failed' ? 'text-danger-6' : undefined,
              item.status === 'waiting' ? 'text-color-text-3' : undefined,
            )}
            aria-hidden
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm text-color-text-1">
              {item.name || item.slug}
            </span>
            <span className="truncate text-xs text-color-text-3">
              {item.error || item.description || item.slug}
            </span>
          </span>
          <span className="shrink-0 text-xs text-color-text-3">
            {INSTALL_STATUS_LABELS[item.status]}
          </span>
        </li>
      );
    })}
  </ul>
);

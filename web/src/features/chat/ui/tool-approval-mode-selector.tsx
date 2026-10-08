/**
 * 工具审批模式选择器。
 *
 * 逐条移植上游 `ToolApprovalModeSelector.vue`：一个下拉触发器 + 两个互斥选项
 * （请求审批 / 完全信任）。上游用 antd Dropdown，这里换成 shadcn 的 DropdownMenu，
 * 保留 `aria-haspopup` / `aria-expanded` 与选项上的 `menuitemradio` + `aria-checked`。
 */
import { Check, ChevronDown, Hand, ShieldAlert } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/lib';

import type { ToolApprovalMode } from '../lib/tool-approval';

const MODE_OPTIONS: ReadonlyArray<{
  value: ToolApprovalMode;
  label: string;
  icon: typeof Hand;
}> = [
  { value: 'default', label: '请求审批', icon: Hand },
  { value: 'always_trust', label: '完全信任', icon: ShieldAlert },
];

type ToolApprovalModeSelectorProps = {
  value: ToolApprovalMode;
  onChange: (mode: ToolApprovalMode) => void;
};

export const ToolApprovalModeSelector = ({
  value,
  onChange,
}: ToolApprovalModeSelectorProps) => {
  const current =
    MODE_OPTIONS.find((option) => option.value === value) ?? MODE_OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={current.label}
          className={cn(
            'flex items-center gap-1 rounded-medium border border-color-border-1 px-2 py-1 text-xs text-color-text-2',
            'hover:text-color-text-1',
            value === 'always_trust' && 'text-warning-6',
          )}
        >
          <CurrentIcon className="size-4" aria-hidden />
          {current.label}
          <ChevronDown className="size-3" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      {/* 菜单的可访问名由触发器提供（Radix 用 aria-labelledby 指回触发器，显式 aria-label 会被覆盖） */}
      <DropdownMenuContent align="start">
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              role="menuitemradio"
              aria-checked={value === option.value}
              onSelect={() => onChange(option.value)}
            >
              <Icon className="size-4" aria-hidden />
              <span>{option.label}</span>
              {value === option.value ? (
                <Check className="size-3" aria-hidden />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

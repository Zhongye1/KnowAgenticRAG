import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { CheckIcon } from 'lucide-react';

import { cn } from '@/shared/lib/utils';

/**
 * 复选框。
 *
 * 上游用 `a-checkbox`（含半选态）；Radix 的 `Checkbox` 用 `checked="indeterminate"` 表达半选，
 * 与 `a-checkbox` 的 `indeterminate` 语义一致。
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 rounded-small border border-input outline-hidden transition-colors',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        {props.checked === 'indeterminate' ? (
          <span className="block size-2 rounded-[2px] bg-current" />
        ) : (
          <CheckIcon className="size-3" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

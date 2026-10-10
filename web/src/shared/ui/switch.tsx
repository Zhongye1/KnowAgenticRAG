import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/shared/lib/utils';

/**
 * 开关。
 *
 * 只有开/关两态，状态文案由调用点渲染在旁边。
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors',
        'bg-color-fill-3 data-[state=checked]:bg-primary',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-color-bg-1 shadow-sm transition-transform',
          'translate-x-0.5 data-[state=checked]:translate-x-4',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

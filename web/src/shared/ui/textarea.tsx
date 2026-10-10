import * as React from 'react';

import { cn } from '@/shared/lib/utils';

/**
 * 多行文本域。
 *
 * 原生 `textarea` 语义，行数由调用点用 `rows` 指定。
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex w-full rounded-small border border-input bg-color-bg-1 px-2 py-1.5 text-sm',
        'placeholder:text-color-text-3',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

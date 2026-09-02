import { MagnifyingGlass } from '@phosphor-icons/react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type KnowledgeSearchInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  'aria-label': string;
  className?: string;
};

export function KnowledgeSearchInput({
  value,
  onValueChange,
  placeholder,
  'aria-label': ariaLabel,
  className,
}: KnowledgeSearchInputProps) {
  return (
    <div className={cn('relative min-w-0 flex-1 sm:max-w-64', className)}>
      <MagnifyingGlass
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="pl-8"
      />
    </div>
  );
}

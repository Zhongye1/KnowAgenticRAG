import { MagnifyingGlass } from '@phosphor-icons/react';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

type KnowledgeToolbarProps = {
  searchPlaceholder: string;
  typeOptions: readonly string[];
  value?: string;
  onChange?: (value: string) => void;
};

export function KnowledgeToolbar({
  searchPlaceholder,
  typeOptions,
  value,
  onChange,
}: KnowledgeToolbarProps) {
  const [innerKeyword, setInnerKeyword] = useState('');
  const keyword = value ?? innerKeyword;
  const [type, setType] = useState(typeOptions[0] ?? '全部');

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-xs">
        <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={(event) => {
            const next = event.target.value;
            setInnerKeyword(next);
            onChange?.(next);
          }}
          placeholder={searchPlaceholder}
          className="pl-8"
        />
      </div>
      <NativeSelect
        value={type}
        onChange={(event) => setType(event.target.value)}
        aria-label="类型筛选"
      >
        {typeOptions.map((option) => (
          <NativeSelectOption key={option} value={option}>
            {option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

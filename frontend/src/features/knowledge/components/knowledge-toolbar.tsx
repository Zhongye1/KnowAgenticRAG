import { MagnifyingGlass } from '@phosphor-icons/react';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

export type KnowledgeBaseSort = 'recent' | 'name';

const SORT_OPTIONS: ReadonlyArray<{
  value: KnowledgeBaseSort;
  label: string;
}> = [
  { value: 'recent', label: '最近更新' },
  { value: 'name', label: '按名称' },
];

type KnowledgeToolbarProps = {
  searchPlaceholder: string;
  /** 受控搜索词；不传时内部维护 */
  value?: string;
  onChange?: (value: string) => void;
  /** 受控排序；不传时内部维护 */
  sort?: KnowledgeBaseSort;
  onSortChange?: (sort: KnowledgeBaseSort) => void;
  /** 结果总数（可选，展示在工具栏右侧） */
  total?: number;
};

export function KnowledgeToolbar({
  searchPlaceholder,
  value,
  onChange,
  sort,
  onSortChange,
  total,
}: KnowledgeToolbarProps) {
  const [innerKeyword, setInnerKeyword] = useState('');
  const [innerSort, setInnerSort] = useState<KnowledgeBaseSort>('recent');

  const keyword = value ?? innerKeyword;
  const currentSort = sort ?? innerSort;

  const handleKeywordChange = (next: string) => {
    setInnerKeyword(next);
    onChange?.(next);
  };

  const handleSortChange = (next: string) => {
    const nextSort = next as KnowledgeBaseSort;
    setInnerSort(nextSort);
    onSortChange?.(nextSort);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-xs">
        <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={(event) => handleKeywordChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label="搜索知识库"
          className="pl-8"
        />
      </div>
      <NativeSelect
        value={currentSort}
        onChange={(event) => handleSortChange(event.target.value)}
        aria-label="排序方式"
      >
        {SORT_OPTIONS.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {typeof total === 'number' ? (
        <span className="text-xs text-muted-foreground">
          共 {total} 个知识库
        </span>
      ) : null}
    </div>
  );
}

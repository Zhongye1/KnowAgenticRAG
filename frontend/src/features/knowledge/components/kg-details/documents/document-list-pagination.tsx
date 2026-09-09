import type { MouseEvent } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

export type DocumentListPaginationProps = {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function getPageNumbers(
  currentPage: number,
  totalPages: number,
): (number | string)[] {
  const pages: (number | string)[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  }

  if (currentPage <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('...');
    pages.push(totalPages);
  } else if (currentPage >= totalPages - 3) {
    pages.push(1);
    pages.push('...');
    for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push('...');
    for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
    pages.push('...');
    pages.push(totalPages);
  }

  return pages;
}

export function DocumentListPagination({
  currentPage,
  totalPages,
  pageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
}: DocumentListPaginationProps) {
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;
  const pages = getPageNumbers(currentPage, totalPages);

  const goTo = (page: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      onPageChange(page);
    }
  };

  return (
    <div className="flex items-center gap-2 py-1 pr-1.5 pl-3">
      {/* Page Size Selector */}
      <span className="text-xs whitespace-nowrap text-muted-foreground">
        每页条数
      </span>
      <Select
        value={String(pageSize)}
        onValueChange={(value) => onPageSizeChange(Number(value))}
      >
        <SelectTrigger
          size="sm"
          aria-label="每页条数"
          className="rounded-small border-transparent bg-transparent"
        >
          <SelectValue placeholder="每页条数" />
        </SelectTrigger>
        <SelectContent>
          {pageSizeOptions.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      {/* Pagination */}
      <Pagination className="mx-0 w-auto">
        <PaginationContent className="gap-1">
          {/* Previous */}
          <PaginationItem>
            <PaginationPrevious
              href={canGoPrev ? `?page=${currentPage - 1}` : undefined}
              onClick={goTo(currentPage - 1)}
              aria-disabled={!canGoPrev}
              className={cn(
                'h-9 px-2.5 text-sm text-color-text-2 hover:bg-color-fill-2 hover:text-color-text-1 dark:hover:bg-color-fill-2',
                !canGoPrev && 'pointer-events-none text-color-text-4',
              )}
            />
          </PaginationItem>

          {/* Page Numbers */}
          {pages.map((page, index) => (
            <PaginationItem key={`${page}-${index}`}>
              {page === '...' ? (
                <PaginationEllipsis className="h-9 w-9 p-0 text-sm text-color-text-4" />
              ) : (
                <PaginationLink
                  href={`?page=${page}`}
                  onClick={goTo(page as number)}
                  isActive={page === currentPage}
                  className={cn(
                    'h-9 w-9 p-0 text-sm transition-colors',
                    page === currentPage
                      ? 'border border-primary-6 bg-primary-6 font-medium text-color-white hover:bg-primary-6 hover:text-color-white dark:border-primary-6 dark:bg-primary-6 dark:hover:bg-primary-6'
                      : 'font-normal text-color-text-2 hover:bg-color-fill-2 hover:text-color-text-1 dark:hover:bg-color-fill-2',
                  )}
                >
                  {page}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          {/* Next */}
          <PaginationItem>
            <PaginationNext
              href={canGoNext ? `?page=${currentPage + 1}` : undefined}
              onClick={goTo(currentPage + 1)}
              aria-disabled={!canGoNext}
              className={cn(
                'h-9 px-2.5 text-sm text-color-text-2 hover:bg-color-fill-2 hover:text-color-text-1 dark:hover:bg-color-fill-2',
                !canGoNext && 'pointer-events-none text-color-text-4',
              )}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

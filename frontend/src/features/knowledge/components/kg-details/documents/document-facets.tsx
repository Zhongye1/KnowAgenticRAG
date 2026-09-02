import type { KBFacetItem } from '@/generated/types';
import { cn } from '@/lib/utils';

import { getSourceTypeLabel } from '../../../utils/file-utils';
import { documentStatusMeta } from '../../../utils/document-policy';

type DocumentFacetsProps = {
  facets?: KBFacetItem[];
  sourceType?: string | null;
  status?: string | null;
  total: number;
  onToggleSourceType: (value: string) => void;
  onToggleStatus: (value: string) => void;
  onReset: () => void;
};

const filterClassName = (active: boolean) =>
  cn(
    'flex w-full items-center justify-between gap-2 rounded-medium px-2 py-1 text-left text-xs transition-colors',
    active
      ? 'bg-primary-6/10 font-medium text-primary-6'
      : 'text-color-text-2 hover:bg-muted hover:text-color-text-1',
  );

function FacetCount({ count }: { count: number }) {
  return <span className="tabular-nums text-muted-foreground">{count}</span>;
}

export function DocumentFacets({
  facets = [],
  sourceType,
  status,
  total,
  onToggleSourceType,
  onToggleStatus,
  onReset,
}: DocumentFacetsProps) {
  const sourceTypeFacets = facets.filter((f) => f.field === 'source_type');
  const statusFacets = facets.filter((f) => f.field === 'status');
  const pipelineFacets = facets.filter((f) => f.field === 'pipeline');
  const hasFilter = Boolean(sourceType || status);

  return (
    <div className="space-y-5 pt-2">
      <button
        type="button"
        onClick={onReset}
        className={cn(filterClassName(!hasFilter), 'w-full')}
      >
        <span>全部文档</span>
        <FacetCount count={total} />
      </button>

      {sourceTypeFacets.length > 0 ? (
        <div>
          <h4 className="mb-1.5 px-2 text-xs font-medium text-muted-foreground">
            来源类型
          </h4>
          <div className="space-y-0.5">
            {sourceTypeFacets.map((facet) => (
              <button
                key={facet.value}
                type="button"
                className={filterClassName(sourceType === facet.value)}
                onClick={() => onToggleSourceType(facet.value)}
              >
                <span className="truncate">
                  {getSourceTypeLabel(facet.value)}
                </span>
                <FacetCount count={facet.count} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {statusFacets.length > 0 ? (
        <div>
          <h4 className="mb-1.5 px-2 text-xs font-medium text-muted-foreground">
            状态
          </h4>
          <div className="space-y-0.5">
            {statusFacets.map((facet) => (
              <button
                key={facet.value}
                type="button"
                className={filterClassName(status === facet.value)}
                onClick={() => onToggleStatus(facet.value)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      documentStatusMeta(facet.value)
                        .className.split(/\s+/)
                        .find((token) => token.startsWith('text-')) ??
                        'text-muted-foreground',
                    )}
                  />
                  <span className="truncate">
                    {documentStatusMeta(facet.value).label}
                  </span>
                </span>
                <FacetCount count={facet.count} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {pipelineFacets.length > 0 ? (
        <div>
          <h4 className="mb-1.5 px-2 text-xs font-medium text-muted-foreground">
            摄取管道
          </h4>
          <div className="space-y-0.5">
            {pipelineFacets.map((facet) => (
              <div
                key={facet.value}
                title="管道筛选将在摄取管线接入后开放"
                className="flex w-full cursor-not-allowed items-center justify-between gap-2 rounded-medium px-2 py-1 text-xs opacity-50"
              >
                <span className="truncate font-mono">{facet.value}</span>
                <FacetCount count={facet.count} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import type { ChatCitation } from '../types';

/**
 * 回答内 [n] 引用角标（D24）：hover 预览片段原文、来源文件与相关度。
 */
export const CitationChip = ({
  n,
  citation,
}: {
  n: number;
  citation?: ChatCitation;
}) => {
  if (!citation) {
    return (
      <sup className="text-primary mx-0.5 align-super text-[10px] font-medium">
        [{n}]
      </sup>
    );
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`引用来源 ${n}`}
            className="bg-primary/10 hover:bg-primary/20 text-primary mx-0.5 inline-flex h-4 min-w-4 cursor-pointer items-center justify-center rounded-full px-1 align-super text-[10px] leading-none font-medium transition-colors"
          >
            {n}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-80 p-3">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-medium">
            <span className="truncate">{citation.source || citation.chunk_id}</span>
            {typeof citation.score === 'number' && (
              <span className="shrink-0 opacity-60">
                相关度 {citation.score.toFixed(2)}
              </span>
            )}
          </div>
          <p className="line-clamp-6 text-xs leading-relaxed break-all whitespace-pre-wrap opacity-90">
            {citation.content}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

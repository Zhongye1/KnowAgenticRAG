import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { useChatRunInfo } from '../hooks/use-chat-run-info';

/** 回答上方的检索元信息：命中片段数、检索模式与模型 */
export const AssistantMessageMeta = () => {
  const meta = useChatRunInfo()?.meta;
  if (!meta) return null;

  const hitCount = typeof meta.hit_count === 'number' ? meta.hit_count : undefined;
  const summary =
    hitCount === 0
      ? '未命中知识库内容'
      : [
          typeof hitCount === 'number' ? `命中 ${hitCount} 段` : undefined,
          meta.mode,
          meta.model_spec,
        ]
          .filter(Boolean)
          .join(' · ');

  if (!summary) return null;

  return (
    <div className="text-muted-foreground mb-1.5 text-xs">{summary}</div>
  );
};

/** 回答下方的参考来源折叠列表（D24 引用条目） */
export const MessageSources = () => {
  const info = useChatRunInfo();
  const citations = info?.citations ?? [];
  const [open, setOpen] = useState(false);

  if (citations.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 rounded-md text-xs transition-colors">
        <ChevronDownIcon
          className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
        参考来源 · {citations.length}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="border-border mt-2 space-y-1.5 border-s-2 ps-3">
          {citations.map((citation) => (
            <li
              key={`${citation.n}-${citation.chunk_id}`}
              className="text-muted-foreground flex items-baseline gap-2 text-xs"
            >
              <span className="bg-primary/10 text-primary inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 font-medium">
                {citation.n}
              </span>
              <span className="text-foreground truncate">
                {citation.source || citation.chunk_id}
              </span>
              {typeof citation.score === 'number' && (
                <span className="ms-auto shrink-0 tabular-nums">
                  {citation.score.toFixed(2)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};

/** 回答因 max_tokens 截断时的提示（D25 done.reason） */
export const TruncationHint = () => {
  const doneReason = useChatRunInfo()?.doneReason;
  if (doneReason !== 'max_tokens') return null;

  return (
    <div className="text-warning-6 mt-2 flex items-center gap-1 text-xs">
      回答因长度限制被截断，可继续提问获取细节
    </div>
  );
};

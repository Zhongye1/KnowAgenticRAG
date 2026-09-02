import {
  Clock,
  Files,
  ImageSquare,
  TextT,
  type Icon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import type { KnowledgeBase } from '../api/types';
import { DeleteKnowledgeBase } from './delete-knowledge-base';
import { getKnowledgeIcon, getKnowledgeThemeAccent } from './knowledge-theme';
import { UpdateKnowledgeBase } from './update-knowledge-base';

type KnowledgeListProps = {
  items: KnowledgeBase[];
  isLoading: boolean;
  selectedKbName: string | null;
  onSelect: (kbName: string | null) => void;
};

type KnowledgeStatProps = {
  icon: Icon;
  label: string;
  value: number;
};

function KnowledgeStat({
  icon: IconComponent,
  label,
  value,
}: KnowledgeStatProps) {
  return (
    <div className="flex flex-col items-center gap-1 px-1">
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <IconComponent className="size-3" aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}

export function KnowledgeList({
  items,
  isLoading,
  selectedKbName,
  onSelect,
}: KnowledgeListProps) {
  if (isLoading) {
    return (
      <div className="flex h-48 w-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((kb) => {
        const active = kb.kb_name === selectedKbName;
        const accent = getKnowledgeThemeAccent(kb.theme);
        const IconComponent = getKnowledgeIcon(kb.icon);

        return (
          <Card
            key={kb.kb_name}
            size="sm"
            className={cn(
              'h-full transition-shadow',
              active && cn('ring-2', accent.ring),
            )}
          >
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-medium',
                    accent.iconBg,
                    accent.iconText,
                  )}
                >
                  <IconComponent className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate">{kb.display_name}</CardTitle>
                  <CardDescription className="mt-0.5 truncate font-mono text-[11px]">
                    {kb.kb_name}
                  </CardDescription>
                </div>
              </div>
              <UpdateKnowledgeBase kb={kb} />
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-3">
              <p
                className={cn(
                  'line-clamp-3 min-h-9 text-xs/relaxed text-muted-foreground',
                  !kb.description && 'italic opacity-70',
                )}
              >
                {kb.description || '暂无描述'}
              </p>
              <div className="grid grid-cols-3 divide-x divide-border rounded-none border border-border py-2">
                <KnowledgeStat
                  icon={Files}
                  label="文档"
                  value={kb.documents ?? 0}
                />
                <KnowledgeStat
                  icon={TextT}
                  label="文本向量"
                  value={kb.text_vectors ?? 0}
                />
                <KnowledgeStat
                  icon={ImageSquare}
                  label="视觉向量"
                  value={kb.visual_vectors ?? 0}
                />
              </div>
            </CardContent>

            <CardFooter className="justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {dayjs(kb.created_time).format('YYYY-MM-DD')}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <DeleteKnowledgeBase
                  kbName={kb.kb_name}
                  displayName={kb.display_name}
                />
                <Button
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => onSelect(active ? null : kb.kb_name)}
                >
                  {active ? '收起文档' : '查看文档'}
                </Button>
              </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

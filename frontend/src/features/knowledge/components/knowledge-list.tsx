import {
  CopyIcon,
  DotsThreeVerticalIcon,
  FilesIcon,
  ImageSquareIcon,
  PencilSimpleIcon,
  TextTIcon,
  TrashSimpleIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { useNotifications } from '@/components/ui/notifications';
import { paths } from '@/config/paths';
import { cn } from '@/lib/utils';

import type { KnowledgeBase } from '../api/types';
import { DeleteKnowledgeBase } from './delete-knowledge-base';
import { getKnowledgeIcon, getKnowledgeThemeAccent } from './knowledge-theme';
import { UpdateKnowledgeBase } from './update-knowledge-base';

type KnowledgeListProps = {
  items: KnowledgeBase[];
  isLoading: boolean;
};

const statBadgeClassName =
  'h-auto gap-1.5 border-border/70 bg-muted/40 px-1 py-1 text-[11px] leading-none text-muted-foreground';

function KnowledgeIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const IconComponent = getKnowledgeIcon(icon);
  // eslint-disable-next-line react/static-components -- 图标映射为模块级常量，仅在渲染时取值
  return <IconComponent className={className} aria-hidden="true" />;
}

function KnowledgeCard({ kb }: { kb: KnowledgeBase }) {
  const { addNotification } = useNotifications();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const accent = getKnowledgeThemeAccent(kb.theme);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(kb.kb_name);
      addNotification({
        type: 'success',
        title: '已复制知识库 ID',
        message: kb.kb_name,
      });
    } catch {
      addNotification({
        type: 'error',
        title: '复制失败',
        message: '请手动选择复制知识库 ID',
      });
    }
  };

  return (
    <>
      <Card className="group/card relative h-full rounded-lg bg-card shadow-sm ring-1 ring-foreground/10 transition-all duration-200 hover:shadow-md hover:ring-primary-6/30">
        <Link
          to={paths.app.knowledge.kg.detail.getHref(kb.kb_name)}
          aria-label={`查看知识库 ${kb.display_name} 的文档`}
          className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary-6 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <span className="sr-only">查看文档</span>
        </Link>

        <CardHeader>
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover/card:scale-[1.03]',
                accent.iconBg,
                accent.iconText,
              )}
            >
              <KnowledgeIcon icon={kb.icon} className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate">{kb.display_name}</CardTitle>
              <CardDescription className="mt-1 truncate font-mono text-[11px]">
                {kb.kb_name}
              </CardDescription>
            </div>
          </div>
          <CardAction className="relative z-10">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${kb.display_name} 更多操作`}
                  title="更多操作"
                >
                  <DotsThreeVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-36 rounded-lg p-1"
              >
                <DropdownMenuItem
                  onSelect={() => {
                    void handleCopyId();
                  }}
                >
                  <CopyIcon />
                  复制知识库 ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setEditOpen(true);
                  }}
                >
                  <PencilSimpleIcon />
                  编辑知识库
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    setDeleteOpen(true);
                  }}
                >
                  <TrashSimpleIcon />
                  删除知识库
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3">
          <p
            className={cn(
              'line-clamp-3 min-h-12 text-xs/relaxed text-muted-foreground',
              !kb.description && 'italic opacity-70',
            )}
          >
            {kb.description || '暂无描述'}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
            <Badge variant="outline" className={statBadgeClassName}>
              <span className="contents">
                <FilesIcon className="size-3.5 opacity-80" aria-hidden="true" />
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {kb.documents ?? 0}
              </span>
              文档
            </Badge>
            <Badge variant="outline" className={statBadgeClassName}>
              <span className="contents">
                <TextTIcon className="size-3.5 opacity-80" aria-hidden="true" />
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {kb.text_vectors ?? 0}
              </span>
              文本向量
            </Badge>
            <Badge variant="outline" className={statBadgeClassName}>
              <span className="contents">
                <ImageSquareIcon
                  className="size-3.5 opacity-80"
                  aria-hidden="true"
                />
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {kb.visual_vectors ?? 0}
              </span>
              视觉向量
            </Badge>
          </div>
        </CardContent>
      </Card>

      <UpdateKnowledgeBase kb={kb} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteKnowledgeBase
        kbName={kb.kb_name}
        displayName={kb.display_name}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}

export function KnowledgeList({ items, isLoading }: KnowledgeListProps) {
  if (isLoading) {
    return (
      <div className="flex h-48 w-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-3">
      {items.map((kb) => (
        <KnowledgeCard key={kb.kb_name} kb={kb} />
      ))}
    </div>
  );
}

import {
  Database,
  Files,
  ImageSquare,
  TextT,
  type Icon,
} from '@phosphor-icons/react';

import type { KnowledgeBaseOverview } from '../../api/types';

type KnowledgeOverviewProps = {
  data: KnowledgeBaseOverview;
};

const STATS: ReadonlyArray<{
  key: keyof KnowledgeBaseOverview;
  label: string;
  icon: Icon;
}> = [
  { key: 'total_kbs', label: '知识库', icon: Database },
  { key: 'total_documents', label: '文档', icon: Files },
  { key: 'total_text_vectors', label: '文本向量', icon: TextT },
  { key: 'total_visual_vectors', label: '视觉向量', icon: ImageSquare },
];

export function KnowledgeOverview({ data }: KnowledgeOverviewProps) {
  return (
    <div className="flex items-center gap-6">
      {STATS.map((stat) => {
        const IconComponent = stat.icon;
        return (
          <div key={stat.key} className="flex items-center gap-2">
            <IconComponent
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="text-sm text-muted-foreground">{stat.label}</span>
            <span className="text-sm font-semibold tabular-nums">
              {data[stat.key] ?? 0}
            </span>
          </div>
        );
      })}
    </div>
  );
}

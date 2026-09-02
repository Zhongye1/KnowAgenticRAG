import {
  Database,
  Files,
  ImageSquare,
  TextT,
  type Icon,
} from '@phosphor-icons/react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { KnowledgeBaseOverview } from '../api/types';

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
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {STATS.map((stat) => {
        const IconComponent = stat.icon;
        return (
          <Card key={stat.key} size="sm">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-muted-foreground">
                {stat.label}
              </CardTitle>
              <IconComponent
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </CardHeader>
            <CardContent className="text-xl font-semibold tabular-nums">
              {data[stat.key] ?? 0}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

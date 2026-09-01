import type { KnowledgeBaseOverview } from '../api/types';

type KnowledgeOverviewProps = {
  data: KnowledgeBaseOverview;
};

const STATS: ReadonlyArray<{
  key: keyof KnowledgeBaseOverview;
  label: string;
}> = [
  { key: 'total_kbs', label: '知识库' },
  { key: 'total_documents', label: '文档' },
  { key: 'total_text_vectors', label: '文本向量' },
  { key: 'total_visual_vectors', label: '视觉向量' },
];

export function KnowledgeOverview({ data }: KnowledgeOverviewProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {STATS.map((stat) => (
        <div
          key={stat.key}
          className="rounded-lg border border-color-border-2 bg-color-bg-1 p-4"
        >
          <div className="text-2xl font-semibold tabular-nums">
            {data[stat.key]}
          </div>
          <div className="mt-1 text-sm text-color-text-2">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

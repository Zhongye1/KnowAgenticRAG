/**
 * 知识库使用情况面板：指标卡 + 知识库类型饼图 + 文件类型饼图（中心轮播）。
 *
 * 两处硬约束：
 * - 该端点在 LITE 模式下不注册，是否挂载由消费方用 `useKnowledgeEnabled()` 的能力投影
 *   决定；不挂载即不请求，未注册的端点不会被访问。
 * - 轮播是这块唯一的定时器，只在文件类型多于 1 种时启动，停止与归位都在 effect 清理里。
 */
import * as React from 'react';
import { Database, FileText, HardDrive } from 'lucide-react';

import {
  buildDistributionPieOption,
  distributionEntries,
} from '../lib/chart-options';
import { formatNumber, formatStorageSize } from '../lib/dashboard-format';
import { useKnowledgeStats } from '../model/dashboard-queries';
import { EChart } from './echart';
import { MetricCard, MetricGrid } from './metric-card';
import { PanelBody, PanelCard, PanelSectionTitle } from './panel-card';
import { Empty } from '@/shared/ui/empty';

/** 中心轮播的切换间隔（毫秒）。 */
const CAROUSEL_INTERVAL = 3000;

type FileTypeEntry = { name: string; value: number };

const FileTypeCarousel = ({ entries }: { entries: FileTypeEntry[] }) => {
  /** 只数「跳了几次」；具体展示哪一条在渲染期取模，条目变化时靠 `key` 重挂载归零。 */
  const [tick, setTick] = React.useState(0);
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);

  React.useEffect(() => {
    if (entries.length <= 1) return;
    const timer = setInterval(
      () => setTick((current) => current + 1),
      CAROUSEL_INTERVAL,
    );
    return () => clearInterval(timer);
  }, [entries.length]);

  const active = entries[tick % entries.length];

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[32%] text-center"
      data-testid="file-type-carousel"
    >
      <div className="truncate px-6 text-sm font-semibold text-color-text-3">
        {active.name}
      </div>
      <div className="text-2xl font-bold leading-none text-color-text-1">
        {active.value}
      </div>
      <div className="text-xs font-medium text-color-text-4">
        {total > 0 ? `${((active.value / total) * 100).toFixed(1)}%` : '0.0%'}
      </div>
    </div>
  );
};

export const KnowledgeStatsPanel = ({
  className,
}: { className?: string } = {}) => {
  const stats = useKnowledgeStats();
  const data = stats.data;
  const storage = formatStorageSize(data?.total_storage_size);
  const fileTypes = distributionEntries(data?.file_type_distribution ?? {});
  const databaseTypes = Object.keys(data?.databases_by_type ?? {});

  return (
    <PanelCard
      title="知识库使用情况"
      description="规模、类型与文件构成"
      testId="knowledge-stats"
      className={className}
    >
      <PanelBody
        loading={stats.isPending}
        error={stats.isError}
        onRetry={() => void stats.refetch()}
        errorText="知识库统计加载失败。"
        height={320}
        testId="knowledge-stats"
      >
        <MetricGrid className="grid-cols-[repeat(auto-fit,minmax(min(100%,130px),1fr))]">
          <MetricCard
            icon={Database}
            value={formatNumber(data?.total_databases)}
            label="知识库总数"
            tone="info"
            compact
          />
          <MetricCard
            icon={FileText}
            value={formatNumber(data?.total_files)}
            label="文件总数"
            tone="success"
            compact
          />
          <MetricCard
            icon={HardDrive}
            value={storage.value}
            label={`存储容量 (${storage.unit})`}
            tone="warning"
            compact
          />
        </MetricGrid>

        <div className="border-t border-color-border-2 pt-3.5">
          <PanelSectionTitle hint={`${databaseTypes.length} 种类型`}>
            知识库类型分布
          </PanelSectionTitle>
          {data && databaseTypes.length > 0 ? (
            <EChart
              testId="knowledge-database-chart"
              ariaLabel="知识库类型分布饼图"
              height={200}
              option={(palette) =>
                buildDistributionPieOption({
                  distribution: data.databases_by_type as Record<
                    string,
                    unknown
                  >,
                  name: '知识库类型',
                  palette,
                }) ?? {}
              }
            />
          ) : (
            <Empty
              description="暂无知识库，创建后会按类型统计。"
              className="py-6"
            />
          )}
        </div>

        <div className="border-t border-color-border-2 pt-3.5">
          <PanelSectionTitle hint="按文件数排序">
            文件类型分布
          </PanelSectionTitle>
          {data && fileTypes.length > 0 ? (
            <div className="relative">
              <EChart
                testId="knowledge-file-chart"
                ariaLabel="文件类型分布饼图"
                height={220}
                option={(palette) =>
                  buildDistributionPieOption({
                    distribution: data.file_type_distribution,
                    name: '文件类型',
                    palette,
                  }) ?? {}
                }
              />
              <FileTypeCarousel
                key={fileTypes
                  .map((entry) => `${entry.name}:${entry.value}`)
                  .join('|')}
                entries={fileTypes}
              />
            </div>
          ) : (
            <Empty
              description="暂无文件，上传后会按扩展名统计。"
              className="py-6"
            />
          )}
        </div>
      </PanelBody>
    </PanelCard>
  );
};

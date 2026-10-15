/** 工具面板（扩展页的「工具」tab）。 */
import * as React from 'react';
import { Wrench } from 'lucide-react';

import { Button, Select, Spin } from 'antd';

import { useTools, type Tool } from '@/entities/tool';
import { Empty as SharedEmpty } from '@/shared/ui/empty';
import { ListRefreshButton, ListToolbar } from '@/shared/ui/list-toolbar';

import { filterTools, toolCategoryOptions } from '../lib/tool-view';
import { ToolCard } from './tool-card';
import { ToolDetailDialog } from './tool-detail-dialog';

export const ToolsPanel = () => {
  const { tools, isLoading, isFetching, error, refetch } = useTools();
  const [keyword, setKeyword] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [selected, setSelected] = React.useState<Tool | null>(null);

  const categoryOptions = React.useMemo(
    () => toolCategoryOptions(tools),
    [tools],
  );
  const visible = React.useMemo(
    () => filterTools(tools, { keyword, category }),
    [category, keyword, tools],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="tools-panel">
      <ListToolbar
        search={{
          value: keyword,
          onChange: setKeyword,
          placeholder: '搜索工具...',
          label: '搜索工具',
        }}
        filters={
          <Select
            className="w-32"
            value={category}
            aria-label="按分类筛选"
            onChange={setCategory}
            options={[{ value: '', label: '全部分类' }, ...categoryOptions]}
          />
        }
        actions={
          <ListRefreshButton
            label="刷新工具"
            refreshing={isFetching}
            onClick={() => void refetch()}
          />
        }
      />

      {isLoading ? (
        <p className="flex items-center gap-2 py-8 text-sm text-color-text-3">
          <Spin aria-hidden className="size-4" />
          正在加载工具…
        </p>
      ) : error ? (
        <div className="flex flex-col items-start gap-2 py-8">
          <p role="alert" className="text-sm text-danger-6">
            {error instanceof Error ? error.message : '加载工具失败。'}
          </p>
          <Button
            htmlType="button"
            variant="outlined"
            onClick={() => void refetch()}
          >
            重试
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <SharedEmpty
          icon={Wrench}
          description={
            keyword || category
              ? '无匹配工具。换个关键词或清空筛选试试。'
              : '暂无工具。'
          }
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {visible.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} onOpen={setSelected} />
          ))}
        </div>
      )}

      <ToolDetailDialog
        tool={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
};

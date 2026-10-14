/**
 * 图谱详情面板：点中实体或关系后展示它的属性。
 *
 * 标题按类型、属性逐行展示、长值竖排、超长值截断并给「展开 / 收起」、换一个元素时展开态重置。
 * 「名称」取后端的 `name`、「类型」单独一行；对象/数组属性用 JSON 渲染。数据全部来自子图
 * payload，面板不发请求。
 */
import * as React from 'react';
import { X } from 'lucide-react';
import { Button, Tag } from 'antd';

import type { GraphEdge, GraphNode } from '../api/graph-api';
import {
  displayValue,
  formatGraphValue,
  isStackedValue,
  isTruncatable,
  visibleEdgeProperties,
} from '../lib/graph-detail';
import { describeEdgeType, describeNodeType } from '../lib/graph-view';

export type GraphDetailPanelProps = {
  visible: boolean;
  item: GraphNode | GraphEdge | null;
  type: 'node' | 'edge';
  onClose: () => void;
};

/** 一行属性；值过长时竖排，超长时给展开/收起。 */
const DetailRow = ({
  label,
  value,
  expanded,
  onToggle,
}: {
  label: string;
  value: unknown;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const text = formatGraphValue(value);
  const stacked = isStackedValue(typeof value === 'string' ? value : text);
  return (
    <div
      className={
        stacked ? 'flex flex-col gap-0.5 py-1' : 'flex gap-2 py-1 text-sm'
      }
    >
      <span className="shrink-0 text-color-text-3">{label}</span>
      <span className="break-words text-color-text-1">
        {displayValue(text, expanded)}
        {isTruncatable(text) ? (
          <Button
            htmlType="button"
            type="link"
            size="small"
            className="h-auto px-1 py-0 align-baseline text-xs"
            onClick={onToggle}
          >
            {expanded ? '收起' : '展开'}
          </Button>
        ) : null}
      </span>
    </div>
  );
};

/**
 * 面板主体。
 *
 * 展开态属于「当前选中的那个元素」，因此由外层用 `key` 绑定元素身份：
 * 换元素即重挂载，展开态自然重置，不需要在 effect 里 setState。
 */
const GraphDetailBody = ({
  item,
  type,
  onClose,
}: Omit<GraphDetailPanelProps, 'visible'> & {
  item: GraphNode | GraphEdge;
}) => {
  const [expandedKeys, setExpandedKeys] = React.useState<Set<string>>(
    () => new Set(),
  );

  const toggle = (key: string) =>
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const isNode = type === 'node';
  const node = isNode ? (item as GraphNode) : null;
  const edge = isNode ? null : (item as GraphEdge);
  const properties = isNode
    ? Object.entries(node?.properties ?? {})
    : visibleEdgeProperties(edge?.properties);

  return (
    <aside
      aria-label={isNode ? '节点详情' : '关系详情'}
      className="absolute left-2.5 top-14 flex max-h-[calc(100%-4.5rem)] w-[280px] flex-col overflow-hidden rounded-large border border-color-border-1 bg-color-bg-1 shadow-lg"
    >
      <header className="flex items-center justify-between border-b border-color-border-1 px-3 py-2">
        <span className="text-sm font-medium text-color-text-1">
          {isNode ? '节点详情' : '关系详情'}
        </span>
        <Button
          htmlType="button"
          variant="text"
          size="small"
          aria-label="关闭详情"
          className="size-6"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </header>

      <div className="flex flex-col gap-1 overflow-y-auto px-3 py-2">
        {isNode ? (
          <>
            <DetailRow
              label="名称"
              value={node?.name ?? ''}
              expanded={expandedKeys.has('__name__')}
              onToggle={() => toggle('__name__')}
            />
            <DetailRow
              label="类型"
              value={describeNodeType(node as GraphNode)}
              expanded={expandedKeys.has('__type__')}
              onToggle={() => toggle('__type__')}
            />
          </>
        ) : (
          <DetailRow
            label="类型"
            value={describeEdgeType(edge as GraphEdge)}
            expanded={expandedKeys.has('__type__')}
            onToggle={() => toggle('__type__')}
          />
        )}
        {isNode ? (
          <div className="flex gap-2 py-1 text-sm">
            <span className="shrink-0 text-color-text-3">ID</span>
            <span className="break-all text-color-text-1">{node?.id}</span>
          </div>
        ) : null}
        {isNode && (node?.labels?.length ?? 0) > 0 ? (
          <div className="flex gap-2 py-1 text-sm">
            <span className="shrink-0 text-color-text-3">标签</span>
            <span className="flex flex-wrap gap-1">
              {node?.labels.map((label) => (
                <Tag key={label}>{label}</Tag>
              ))}
            </span>
          </div>
        ) : null}
        {properties.length === 0 ? (
          <p className="py-1 text-sm text-color-text-3">没有更多属性。</p>
        ) : (
          properties.map(([key, value]) => (
            <DetailRow
              key={key}
              label={key}
              value={value}
              expanded={expandedKeys.has(key)}
              onToggle={() => toggle(key)}
            />
          ))
        )}
      </div>
    </aside>
  );
};

export const GraphDetailPanel = ({
  visible,
  item,
  type,
  onClose,
}: GraphDetailPanelProps) => {
  if (!visible || !item) return null;
  return (
    <GraphDetailBody
      key={`${type}:${item.id}`}
      item={item}
      type={type}
      onClose={onClose}
    />
  );
};

/**
 * 数据总览的区块外壳与面板状态。
 *
 * 直接用 antd `Card`，标题、描述与操作都放在它的 `title` 槽位：`extra` 会把操作
 * 摆在标题同一行的右端，而这里要的是标题与描述「下面」的一整行工具栏。
 * 头部下边框由 antd 主题给出，不再自绘。五处需要显式指定：
 * 操作行在 `title` 槽位内占第二行，要让 `ant-card-head-title` 默认的单行省略让位，
 * 用 `classNames.title` 放回换行；`ant-card-head` 按单行标题设计，多行内容会顶到
 * 边框，用 `styles.header` 补回纵向内边距；body 内边距沿用自绘版本的数值；
 * `ant-card-head` 自带 `fontWeightStrong`，标题要常规字重，用 `font-normal` 压掉；
 * 头部内容字号是 16px，工具栏要压回 14px 才与同排控件对齐。
 * `PanelBody` 承担加载/失败两态：失败必须能重试，而不是留一块空白。
 */
import type * as React from 'react';

import { Button, Card, Flex, Spin, Typography } from 'antd';

import { cn } from '@/shared/lib';

export const PanelCard = ({
  title,
  description,
  actions,
  children,
  className,
  testId,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) => (
  <Card
    data-testid={testId}
    className={cn('flex min-w-0 flex-col', className)}
    styles={{
      // 头部按 antd 单行标题设计，标题下多一行描述会顶到边框，补回纵向内边距；
      // 数值与自绘版本一致（原先 header 是 px-4 py-3、body 是 px-4 py-4）
      header: { paddingBlock: 12, paddingInline: 16 },
      body: { flex: 1, minWidth: 0, padding: 16 },
    }}
    classNames={{ title: 'whitespace-normal' }}
    title={
      <Flex vertical gap={8} className="min-w-0">
        <Flex vertical gap={2} className="min-w-0">
          <Typography.Text className="text-base">
            {title}
          </Typography.Text>
          {description ? (
            // 次级说明同样继承了 `ant-card-head` 的 `fontWeightStrong`，压回常规
            <Typography.Text
              type="secondary"
              className="text-xs font-normal"
            >
              {description}
            </Typography.Text>
          ) : null}
        </Flex>
        {actions ? (
          // `ant-card-head` 给头部内容定的是 16px / `fontWeightStrong`；工具栏跟着它会
          // 比同排控件更粗更大（Segmented 的标签不自带字重，直接继承成 600），压回常规
          <Flex align="center" gap={8} wrap className="text-sm font-normal">
            {actions}
          </Flex>
        ) : null}
      </Flex>
    }
  >
    <Flex vertical gap={16} className="min-w-0">
      {children}
    </Flex>
  </Card>
);

/** 面板内的分组小标题（与卡片标题区分层级）。 */
export const PanelSectionTitle = ({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) => (
  <Flex align="baseline" gap={8} wrap>
    <Typography.Title level={4} className="mb-0 text-sm">
      {children}
    </Typography.Title>
    {hint ? (
      <Typography.Text type="secondary" className="text-[11px]">
        {hint}
      </Typography.Text>
    ) : null}
  </Flex>
);

/**
 * 面板内容的加载/失败两态。
 *
 * 加载中给固定高度而不是空 div：否则数据到位时整页跳动。
 * 失败态带重试入口，重试就是重新发这次查询（`refetch`）。
 */
export const PanelBody = ({
  loading,
  error,
  onRetry,
  errorText = '数据加载失败。',
  height = 240,
  children,
  testId,
}: {
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  errorText?: string;
  height?: number;
  children: React.ReactNode;
  testId?: string;
}) => {
  if (error) {
    return (
      <Flex
        data-testid={testId ? `${testId}-error` : undefined}
        role="alert"
        vertical
        align="center"
        justify="center"
        gap={12}
        style={{ minHeight: height }}
      >
        <Typography.Text type="danger" className="text-xs">
          {errorText}
        </Typography.Text>
        {onRetry ? (
          <Button
            htmlType="button"
            variant="outlined"
            size="small"
            onClick={onRetry}
          >
            重新加载
          </Button>
        ) : null}
      </Flex>
    );
  }
  if (loading) {
    return (
      <Flex
        data-testid={testId ? `${testId}-loading` : undefined}
        align="center"
        justify="center"
        style={{ minHeight: height }}
      >
        <Spin size="small" />
      </Flex>
    );
  }
  return (
    <Flex data-testid={testId} vertical gap={16} className="min-w-0">
      {children}
    </Flex>
  );
};

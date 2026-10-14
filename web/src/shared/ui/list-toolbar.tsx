/**
 * 卡片列表页的工具栏。
 *
 * 这套控件词汇的事实源是 `/agent-manage` 的「搜索智能体 + 新增智能体 + 刷新」那一行：搜索框
 * 固定 32px 高、图标压在输入框左侧、右侧动作整组靠右、刷新是无边框的文字按钮且取数时转动。
 * 扩展页的四个面板（知识库 / 技能 / 工具 / MCP）都用它，避免四处各写一遍同样的类名。
 *
 * antd 的 reset 在 base 层压过了组件层的 color/font（按钮文字继承 body 深色、输入框继承 16px
 * 行高），所以输入框显式写 `h-8 leading-8`、主按钮显式写 `text-color-white`；`shadow-none` 去掉
 * 非线框主按钮自带的 2px 底部投影。
 */
import * as React from 'react';
import { RefreshCw, Search } from 'lucide-react';

import { Button, Input } from 'antd';

type ListToolbarProps = {
  search: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    /** 无障碍名；搜索框没有可见文案，靠它给读屏与测试定位。 */
    label: string;
  };
  /** 搜索框与右侧动作之间的筛选控件（类型按钮、分类下拉等）。 */
  filters?: React.ReactNode;
  /** 右侧动作组；整组靠右，渲染顺序即显示顺序。 */
  actions: React.ReactNode;
};

export const ListToolbar = ({ search, filters, actions }: ListToolbarProps) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="relative w-full max-w-[33vw] sm:w-auto sm:flex-1">
      {/* z-10：图标是绝对定位的兄弟节点，会被后绘的不透明输入框盖住 */}
      <Search
        className="pointer-events-none absolute top-1/2 left-2 z-10 size-4 -translate-y-1/2 text-color-text-3"
        aria-hidden
      />
      <Input
        value={search.value}
        onChange={(event) => search.onChange(event.target.value)}
        placeholder={search.placeholder}
        aria-label={search.label}
        className="h-8 pl-8 leading-8"
      />
    </div>

    {filters}

    <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
  </div>
);

type ListRefreshButtonProps = {
  /** 无障碍名；按钮只有图标。 */
  label: string;
  /** 取数中：图标转动。 */
  refreshing: boolean;
  onClick: () => void;
};

/** 工具栏上的刷新钮；无边框文字按钮，取数中图标转动。 */
export const ListRefreshButton = ({
  label,
  refreshing,
  onClick,
}: ListRefreshButtonProps) => (
  <Button
    htmlType="button"
    type="text"
    size="small"
    aria-label={label}
    onClick={onClick}
  >
    <RefreshCw
      className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
      aria-hidden
    />
  </Button>
);

/** 工具栏上的主操作按钮；与 `/agent-manage` 的「新增智能体」同一形态。 */
export const ListPrimaryButton = ({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => (
  <Button
    htmlType="button"
    type="primary"
    disabled={disabled}
    className="text-color-white shadow-none"
    onClick={onClick}
  >
    {children}
  </Button>
);

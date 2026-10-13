/**
 * 对话页的 antd Dropdown 适配。
 *
 * shared/ui/dropdown-menu 是 Radix 的复合组件（Trigger / Content / Item / Label /
 * Separator + `asChild`），antd Dropdown 的词汇是单个 `menu={{items}}`。本适配接受
 * 描述性的 `items` 数组并负责组装，触发器作为 children 直接渲染——`asChild` 的
 * 「触发器就是第一个子元素」语义由 antd 原生支持。
 *
 * 迁移期四个调用方改一次调用形态；B6 收口后适配层即可删除。
 */
import * as React from 'react';
import { Dropdown as AntdDropdown, type MenuProps } from 'antd';
import { Check } from 'lucide-react';

export type ChatDropdownItem =
  | { kind: 'label'; label: string; key: string }
  | { kind: 'separator'; key: string }
  | {
      kind: 'item';
      key: string;
      label: React.ReactNode;
      onSelect: () => void;
      disabled?: boolean;
      /** 选中态展示对勾（antd 渲染 aria-checked / aria-selected）。 */
      selected?: boolean;
      /** 互斥选择语义（menuitemradio）；审批模式这类单选菜单用。 */
      radio?: boolean;
    };

export type ChatDropdownProps = {
  items: ChatDropdownItem[];
  /** 触发器；antd 直接把它当作定位锚点与点击目标。 */
  children: React.ReactNode;
  align?: 'start' | 'end';
  /** 内容区的额外类（如滚动上限）；落在弹出层根上。 */
  contentClassName?: string;
  disabled?: boolean;
  /** 向上弹出（输入区的选择器都朝上，参照 placement="topLeft"）。 */
  placement?: 'topLeft' | 'bottomLeft' | 'topRight' | 'bottomRight';
};

const toAntdItems = (items: ChatDropdownItem[]): MenuProps['items'] =>
  items.map((item) => {
    if (item.kind === 'separator') return { type: 'divider', key: item.key };
    if (item.kind === 'label') return { type: 'group', key: item.key, label: item.label };
    return {
      key: item.key,
      // 互斥选择的选项用 option 语义：rc-menu 只对 role='option' 渲染
      // aria-selected，menuitemradio 的 aria-checked 它不渲染
      ...(item.radio ? { role: 'option' as const } : {}),
      label: item.selected ? (
        <span className="chat-dropdown-item-inner">
          {item.label}
          <Check className="chat-dropdown-item-check" />
        </span>
      ) : (
        item.label
      ),
      disabled: item.disabled,
    };
  });

export const Dropdown = ({
  items,
  children,
  align = 'start',
  disabled,
  placement,
}: ChatDropdownProps) => (
  <AntdDropdown
    menu={{
      items: toAntdItems(items),
      // 选中态由调用方声明（selectedKeys），不由菜单内部维护：
      // 审批模式的「当前项」跟着外部状态走，点过的项不会自动变成选中
      selectedKeys: items
        .filter((item) => item.kind === 'item' && item.selected)
        .map((item) => item.key),
      onClick: ({ key }) => {
        const item = items.find(
          (candidate): candidate is Extract<ChatDropdownItem, { kind: 'item' }> =>
            candidate.kind === 'item' && candidate.key === key,
        );
        item?.onSelect();
      },
      selectable: true,
    }}
    trigger={['click']}
    placement={placement ?? (align === 'end' ? 'bottomRight' : 'bottomLeft')}
    disabled={disabled}
    overlayClassName="chat-dropdown-overlay"
  >
    {children}
  </AntdDropdown>
);


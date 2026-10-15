/** 输入区右侧的模型选择器。 */
import * as React from 'react';
import styles from './input-selector.module.css';

import { Dropdown } from 'antd';
import {
  toAntdMenuItems,
  toSelectedKeys,
  findItem,
  type ChatDropdownItem,
} from './chat-dropdown';

import type { ChatModelGroup } from '../api/model-api';
import { formatModelSpecLabel } from '../lib/model-spec';

type ModelSelectorProps = {
  groups: ChatModelGroup[];
  /** 当前生效的模型 spec；空串表示没有显式选择。 */
  selected: string;
  placeholder: string;
  loading?: boolean;
  onSelect: (spec: string) => void;
};

export const ModelSelector = ({
  groups,
  selected,
  placeholder,
  loading = false,
  onSelect,
}: ModelSelectorProps) => {
  const label = loading
    ? '加载中...'
    : formatModelSpecLabel(selected, placeholder);

  const items: ChatDropdownItem[] = [
    {
      kind: 'item',
      key: '',
      label: '默认',
      onSelect: () => onSelect(''),
      selected: !selected,
    },
  ];
  for (const group of groups) {
    items.push({ kind: 'separator', key: `sep-${group.providerId}` });
    items.push({
      kind: 'label',
      key: `label-${group.providerId}`,
      label: group.providerName,
    });
    for (const model of group.models) {
      items.push({
        kind: 'item',
        key: model.spec,
        label: (
          <span className={styles.menuItemLabel} title={model.spec}>
            {model.label}
          </span>
        ),
        onSelect: () => onSelect(model.spec),
        selected: selected === model.spec,
      });
    }
  }

  return (
    <Dropdown
      menu={{
        items: toAntdMenuItems(items),
        selectedKeys: toSelectedKeys(items),
        onClick: ({ key }) => findItem(items, key)?.onSelect(),
        selectable: true,
      }}
      trigger={['click']}
      placement="topLeft"
      disabled={loading}
      // 列表还没回来时不给开：那时候面板里只有「默认」一条，点它等于清空选择
    >
      <button
        type="button"
        className={styles.trigger}
        title={selected || placeholder}
        aria-label="选择模型"
        disabled={loading}
      >
        {/* 触发钮只有模型名，没有箭头；这里保持同样的视觉，
           但用 button 而不是 div——点击目标需要可聚焦、可读屏 */}
        <span className={styles.triggerLabel}>{label}</span>
      </button>
    </Dropdown>
  );
};

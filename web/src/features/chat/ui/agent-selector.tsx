/**
 * 输入区左侧的智能体选择器。
 *
 * 结构对齐参照的 `AgentView.vue` 里那个下拉：触发按钮显示当前智能体名，面板里逐条列出
 * 可切换的智能体（内置的挂徽标、当前项打勾）；切换被拒绝时把原因交回调用方提示。
 *
 * **没有做「编辑智能体 / 新建智能体」两个动作**：参照里它们分别跳智能体管理页与打开
 * 智能体编辑弹窗，本仓两者都还没有；渲染一个点了没反应的入口比不渲染更糟。
 */
import * as React from 'react';
import { Bot, Check, ChevronDown } from 'lucide-react';
import styles from './input-selector.module.css';

import { Dropdown, type ChatDropdownItem } from './antd-dropdown';

import {
  agentSwitchBlockReason,
  currentAgentLabel,
  type AgentOption,
} from '../lib/agent-options';

type AgentSelectorProps = {
  options: AgentOption[];
  selected: string | null;
  loading?: boolean;
  /** 当前地址是否已经绑定了一条会话。 */
  hasActiveThread: boolean;
  isCreatingThread?: boolean;
  onSelect: (slug: string) => void;
  /** 切换被拒绝时回调，用来提示原因。 */
  onBlocked: (reason: string) => void;
};

export const AgentSelector = ({
  options,
  selected,
  loading = false,
  hasActiveThread,
  isCreatingThread = false,
  onSelect,
  onBlocked,
}: AgentSelectorProps) => {
  const label = currentAgentLabel(options, selected, loading);

  const handleSelect = (slug: string) => {
    if (slug === selected) return;

    const reason = agentSwitchBlockReason({
      hasActiveThread,
      isCreatingThread,
    });
    if (reason) {
      onBlocked(reason);
      return;
    }

    onSelect(slug);
  };

  const items: ChatDropdownItem[] = options.map((option) => ({
    kind: 'item',
    key: option.value,
    label: (
      <span className={styles.menuItem}>
        <span className={styles.menuItemLabel}>{option.label}</span>
        {option.isBuiltin ? (
          <span className={styles.menuItemTag}>内置</span>
        ) : null}
        {option.value === selected ? (
          <Check className={styles.menuItemCheck} aria-hidden />
        ) : null}
      </span>
    ),
    onSelect: () => handleSelect(option.value),
    // 已选中的项可再点（关掉弹窗），但不能触发切换的请求路径
    disabled: option.value === selected && Boolean(hasActiveThread),
  }));

  return (
    <Dropdown items={items} disabled={loading || isCreatingThread} placement="topLeft">
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        disabled={loading || isCreatingThread}
      >
        <Bot className={styles.triggerIcon} aria-hidden />
        <span className={styles.triggerLabel}>{label}</span>
        <ChevronDown className={styles.triggerChevron} aria-hidden />
      </button>
    </Dropdown>
  );
};

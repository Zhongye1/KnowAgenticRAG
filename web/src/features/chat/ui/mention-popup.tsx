/**
 * 提及候选弹窗。
 *
 * 按「文件 / 知识库 / MCP / Skills / Subagents」分组展示，但键盘导航用的是**整体第几项**
 * ——用户按上下键时不会意识到分组边界，所以活动下标在一个连续的序列里。
 *
 * 文件组在还没有查询词时只给一句提示：文件搜索是远程的，空查询下本地没有结果可列。
 * 参照实现 `MessageInputComponent.vue` 的 `.mention-popup` 段：文件行用彩色类型图标
 * 与 11px 路径列，资源行不带图标；命中查询词的片段以金橘色加粗（`.query-match`）。
 */
import * as React from 'react';

import { resolveFileIconUrl } from '@/shared/lib/files';
import styles from './mention-editor.module.css';
import { MENTION_GROUP_TITLES, type MentionGroups } from '../lib/mention-query';
import type { MentionResourceItem } from '../lib/mention-resources';

type MentionPopupProps = {
  groups: MentionGroups;
  /** 整体第几项；`-1` 表示没有选中项。 */
  activeIndex: number;
  query: string;
  onSelect: (item: MentionResourceItem) => void;
  onHoverIndex: (index: number) => void;
};

/** 把命中查询词的片段染上 `.query-match`；没查询词时原样返回。 */
const highlightLabel = (label: string, query: string): React.ReactNode => {
  const needle = query.trim().toLowerCase();
  if (!needle) return label;

  const index = label.toLowerCase().indexOf(needle);
  if (index < 0) return label;

  return [
    label.slice(0, index),
    <mark key="hit" className={styles.queryMatch}>
      {label.slice(index, index + needle.length)}
    </mark>,
    label.slice(index + needle.length),
  ];
};

/** 全部分组都为空；与 `isEmptyMentionGroups` 判定一致，用于渲染空态提示。 */
const hasAnyItem = (groups: MentionGroups): boolean =>
  MENTION_GROUP_TITLES.some(({ key }) => groups[key].length > 0);

export const MentionPopup = ({
  groups,
  activeIndex,
  query,
  onSelect,
  onHoverIndex,
}: MentionPopupProps) => {
  // 每个分组的起始整体下标；在渲染期用可变计数会让「活动项」在重渲时错位
  const groupStart = React.useMemo(() => {
    const starts: Partial<Record<string, number>> = {};
    let running = 0;
    for (const { key } of MENTION_GROUP_TITLES) {
      starts[key] = running;
      running += groups[key].length;
    }

    return starts;
  }, [groups]);

  return (
    <div
      className={styles.popup}
      /* 自定义候选弹窗用的是 ARIA 的 listbox/option 模式：原生 select 放不下图标、
         描述与悬停高亮，datalist 无法自定义呈现 */
      /* eslint-disable-next-line jsx-a11y/prefer-tag-over-role */
      role="listbox"
      aria-label="提及候选"
    >
      {!hasAnyItem(groups) ? (
        <div className={styles.empty}>暂无可引用的项</div>
      ) : null}
      {MENTION_GROUP_TITLES.map(({ key, title }) => {
        const items = groups[key];
        const isFileGroup = key === 'files';
        const showSearchHint = isFileGroup && !query.trim();

        if (items.length === 0 && !showSearchHint) return null;

        return (
          <div key={key} className={styles.group}>
            <div className={styles.groupTitle}>{title}</div>

            {showSearchHint ? (
              <div className={styles.searchPlaceholder}>
                输入相关内容以搜索文件
              </div>
            ) : null}

            {items.map((item, indexInGroup) => {
              const index = (groupStart[key] ?? 0) + indexInGroup;
              // 参照：文件行用彩色类型图标 + 路径列；资源行不带图标
              const isFile = item.type === 'file';
              const parentDir = isFile
                ? item.value.split('/').slice(0, -1).join('/') || '/'
                : '';

              return (
                <button
                  key={`${item.type}-${item.value}-${index}`}
                  type="button"
                  /* eslint-disable-next-line jsx-a11y/prefer-tag-over-role */
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`${styles.item} ${index === activeIndex ? styles.itemActive : ''}`}
                  onMouseEnter={() => onHoverIndex(index)}
                  onClick={() => onSelect(item)}
                >
                  {isFile ? (
                    <img
                      className={styles.itemFileIcon}
                      src={resolveFileIconUrl(item.value, { isDir: false })}
                      alt=""
                      draggable={false}
                    />
                  ) : null}
                  <span className={styles.itemName}>
                    {highlightLabel(item.label, query)}
                  </span>
                  {isFile ? (
                    <span className={styles.itemPath}>{parentDir}</span>
                  ) : item.description ? (
                    <span className={styles.itemDescription}>
                      {item.description}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/**
 * 输入胶囊左侧的「+」展开面板。
 *
 * 参照 MessageInputComponent 的 `.expand-options`（28px 图标钮，点击展开）与
 * AttachmentOptionsComponent（面板内容）：先列「添加附件 / 上传图片」，再按资源分组
 * 进入二级页选择知识库或技能，选中即把令牌插进输入框。
 *
 * 参照只放知识库与技能两组（`RESOURCE_GROUPS`）：MCP 与子智能体在参照里只出现在 `@`
 * 候选弹窗，不在这里，因此本仓也不重复提供。
 */
import * as React from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Database,
  FileText,
  Image,
  Plus,
  WandSparkles,
} from 'lucide-react';

import { Dropdown, Spin } from 'antd';

import { getMentionIcon } from './mention-icons';
import type { MentionType } from '../lib/mention-token';
import type { MentionResourceItem } from '../lib/mention-resources';
import styles from './composer-options.module.css';

/** 面板里的资源分组：键是分组标识，值是它在提及候选里对应的类型。 */
const RESOURCE_GROUPS = [
  { key: 'knowledge', label: '知识库', icon: Database },
  { key: 'skill', label: '技能', icon: WandSparkles },
] as const satisfies ReadonlyArray<{
  key: MentionType;
  label: string;
  icon: typeof Database;
}>;

type ResourceGroupKey = (typeof RESOURCE_GROUPS)[number]['key'];

type ComposerOptionsProps = {
  /**
   * 流式中：只锁「上传图片」。参照的 `disabled` 是另一个条件（无智能体或审批接管中），
   * 且会同时锁住附件与提及选择；本仓的附件走弹窗、提及走 `@` 候选，流式期间都不受影响。
   */
  disabled?: boolean;
  mentionItems: MentionResourceItem[];
  imagePending: boolean;
  onOpenAttachments: () => void;
  onUploadImage: () => void;
  onInsertMention: (item: MentionResourceItem) => void;
};

export const ComposerOptions = ({
  disabled = false,
  mentionItems,
  imagePending,
  onOpenAttachments,
  onUploadImage,
  onInsertMention,
}: ComposerOptionsProps) => {
  const [open, setOpen] = React.useState(false);
  const [activeGroup, setActiveGroup] = React.useState<ResourceGroupKey | null>(
    null,
  );

  const groups = RESOURCE_GROUPS.map((group) => ({
    ...group,
    items: mentionItems.filter((item) => item.type === group.key),
  })).filter((group) => group.items.length > 0);

  const active = groups.find((group) => group.key === activeGroup) ?? null;

  const close = () => setOpen(false);

  const panel = (
    <div
      className={styles.panel}
      role="menu"
      aria-label={active ? `${active.label}选择` : '添加内容'}
    >
      {active ? (
        <>
          <button
            type="button"
            className={styles.back}
            aria-label="返回添加内容菜单"
            onClick={() => setActiveGroup(null)}
          >
            <ArrowLeft className={styles.backIcon} aria-hidden />
            <span>{active.label}</span>
          </button>

          <div className={styles.divider} />

          <div className={styles.resourceList}>
            {active.items.map((item) => {
              const Icon = getMentionIcon(item.type);
              return (
                <button
                  key={item.value}
                  type="button"
                  role="menuitem"
                  className={`${styles.item} ${styles.resourceItem}`}
                  title={item.description || item.label}
                  onClick={() => {
                    onInsertMention(item);
                    close();
                  }}
                >
                  <Icon className={styles.itemIcon} aria-hidden />
                  <span className={styles.resourceContent}>
                    <span className={styles.itemLabel}>{item.label}</span>
                    <span className={styles.resourceDescription}>
                      {item.description || '暂无描述'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            title="支持任意文件格式，单个不超过 5 MB"
            onClick={() => {
              onOpenAttachments();
              close();
            }}
          >
            <FileText className={styles.itemIcon} aria-hidden />
            <span className={styles.itemLabel}>添加附件</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            title="支持 jpg/jpeg/png/gif，单个不超过 5 MB"
            disabled={disabled}
            onClick={() => {
              onUploadImage();
              close();
            }}
          >
            {imagePending ? (
              <Spin size="small" aria-hidden />
            ) : (
              <Image className={styles.itemIcon} aria-hidden />
            )}
            <span className={styles.itemLabel}>上传图片</span>
          </button>

          {groups.length > 0 ? <div className={styles.divider} /> : null}

          {groups.map((group) => {
            const Icon = group.icon;
            return (
              <button
                key={group.key}
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => setActiveGroup(group.key)}
              >
                <Icon className={styles.itemIcon} aria-hidden />
                <span className={styles.itemLabel}>{group.label}</span>
                <ChevronRight className={styles.chevron} aria-hidden />
              </button>
            );
          })}
        </>
      )}
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // 收起面板即回到一级页：下次展开不该停在上次选过的分组里
        if (!next) setActiveGroup(null);
      }}
      trigger={['click']}
      placement="topLeft"
      popupRender={() => panel}
    >
      <button
        type="button"
        className={styles.expandButton}
        aria-label="添加内容"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus className={styles.expandIcon} aria-hidden />
      </button>
    </Dropdown>
  );
};

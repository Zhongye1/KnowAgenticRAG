/**
 * 扩展卡片。
 *
 * 词汇的事实源是参照 `components/shared/InfoCard.vue` 的 default 形态：32px 图标块
 * （gray-50 底 + gray-150 边框 + 7px 圆角）、名称 14px/600 + 副标题 12px 等宽、描述最多
 * 两行（`min-height: 2.8em` 保证单行描述的卡片不塌）、底部标签行（11px/600、22px 高、
 * 4px 圆角，颜色键映射到参照 main.css 的 `.card-tag.tag-*`）。整卡 hover 换
 * gray-300 边框 + gray-25 底。
 *
 * 标签用自绘的 `<span>` 而不是 antd `Tag`：参照的标签更小更扁（11px/22px vs antd 的
 * 12px/24px），颜色键也要按参照的映射走。
 */
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib';

/** 标签的语义色；键与参照 `main.css` 的 `.card-tag.tag-*` 同集。 */
export type InfoCardTagColor =
  'gray' | 'blue' | 'purple' | 'cyan' | 'red' | 'orange' | 'green' | 'gold';

export type InfoCardTag = {
  name: string;
  color?: InfoCardTagColor;
};

const TAG_CLASS: Record<InfoCardTagColor, string> = {
  gray: 'bg-[var(--gray-100)] text-[var(--gray-600)]',
  blue: 'bg-[var(--color-info-50)] text-[var(--color-info-700)]',
  purple: 'bg-[var(--color-accent-50)] text-[var(--color-accent-700)]',
  cyan: 'bg-[var(--color-accent-50)] text-[var(--color-accent-700)]',
  red: 'bg-[var(--color-error-50)] text-[var(--color-error-700)]',
  orange: 'bg-[var(--color-error-50)] text-[var(--color-error-700)]',
  green: 'bg-[var(--color-success-50)] text-[var(--color-success-700)]',
  gold: 'bg-[var(--color-warning-50)] text-[var(--color-warning-900)]',
};

/** 卡片右上的动作区内容；参照的 `#actions` 插槽（启停按钮、状态点等）。 */
export const InfoCard = ({
  /** 可选的卡片标识（slug 等），挂到根节点供测试与读屏定位。 */
  slug,
  /** 根节点的 test id；默认 `info-card`，调用方按领域覆盖（如 `knowledge-card`）。 */
  testId = 'info-card',
  title,
  subtitle,
  description,
  tags = [],
  icon,
  action,
  onOpen,
  children,
  className,
}: {
  /** 可选的卡片标识（slug 等），挂到根节点供测试与读屏定位。 */
  slug?: string;
  /** 根节点的 test id；默认 `info-card`，调用方按领域覆盖（如 `knowledge-card`）。 */
  testId?: string;
  /** 卡片标题；长名截断，`title` 属性给完整值。 */
  title: string;
  /** 标题下的等宽小字（slug、统计摘要）。 */
  subtitle?: string;
  /** 最多两行的描述。 */
  description?: string;
  /** 底部标签行。 */
  tags?: InfoCardTag[];
  /** 图标块内容（16–20px 的 Lucide 组件）；不传渲染占位块。 */
  icon?: ReactNode;
  /** 右上角动作区（启停开关、菜单触发器等）。 */
  action?: ReactNode;
  /** 整卡点击；键盘入口由标题按钮或动作区提供。 */
  onOpen: () => void;
  /** 与标签行同一行的右端内容（知识库卡的统计摘要）。 */
  children?: ReactNode;
  className?: string;
}) => (
  // 卡片表面可点只是指针便利：键盘入口在标题按钮与动作区，不给 article 加 role/tabIndex
  // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- 键盘入口在卡片内的按钮
  <article
    data-testid={testId}
    {...(slug ? { 'data-slug': slug } : {})}
    className={cn(
      // group/card：动作区里的「一钮两态」按钮靠它做悬停切换（与参照的 .info-card:hover 同语义）
      'group/card flex cursor-pointer flex-col gap-2.5 overflow-hidden rounded-[8px] border border-[var(--gray-150)] bg-[var(--gray-0)] p-4 transition-colors hover:border-[var(--gray-300)] hover:bg-[var(--gray-25)]',
      className,
    )}
    onClick={onOpen}
  >
    <header className="flex items-center gap-2.5">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-[7px] border border-[var(--gray-150)] bg-[var(--gray-50)] text-[var(--gray-600)]"
        aria-hidden
      >
        {icon}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          className="max-w-full truncate border-0 bg-transparent p-0 text-left text-sm font-semibold text-[var(--gray-900)]"
          title={title}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          {title}
        </button>
        {subtitle ? (
          <span
            className="truncate font-mono text-xs text-[var(--gray-600)]"
            title={subtitle}
          >
            {subtitle}
          </span>
        ) : null}
      </div>

      {action ? (
        <div className="flex min-h-6 shrink-0 items-center gap-1">{action}</div>
      ) : null}
    </header>

    {description ? (
      <div
        className="line-clamp-2 min-h-[2.8em] text-[13px] leading-[1.4] text-[var(--gray-600)]"
        title={description}
      >
        {description}
      </div>
    ) : null}

    {tags.length || children ? (
      <div className="flex flex-wrap items-center gap-2">
        {tags.length ? (
          <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
            {tags.map((tag, index) => (
              <li
                key={`${tag.name}:${index}`}
                className={cn(
                  'inline-flex min-h-[22px] items-center rounded-[4px] px-2 text-[11px] leading-none',
                  TAG_CLASS[tag.color ?? 'gray'],
                )}
              >
                {tag.name}
              </li>
            ))}
          </ul>
        ) : null}

        {/* 标签在左、children 靠右：两者同一行；窄卡换行时 children 仍靠右 */}
        {children ? (
          <div className={cn('min-w-0', tags.length && 'ml-auto')}>{children}</div>
        ) : null}
      </div>
    ) : null}
  </article>
);
